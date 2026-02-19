import os
import asyncio
import httpx
import base64
import json
import pytz
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Google Auth & Sheets
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DE BASE DE DATOS (SQLite Local) ---
DATABASE_URL = "sqlite:///./meta_control.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS SQL ---
class AdSetSetting(Base):
    __tablename__ = "adset_settings"
    id = Column(String, primary_key=True, index=True)
    turno = Column(String, default="L-V")
    limit_perc = Column(Float, default=50.0)
    is_frozen = Column(Boolean, default=False)

class AutomationState(Base):
    __tablename__ = "automation_state"
    id = Column(Integer, primary_key=True, default=1)
    is_active = Column(Boolean, default=False)

class ActionLog(Base):
    __tablename__ = "action_logs"
    id = Column(Integer, primary_key=True, index=True)
    user = Column(String)
    msg = Column(String)
    time = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# --- IDs PERMITIDOS ---
ALLOWED_ADSET_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
]

# --- CONFIGURACIÓN META ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"

# --- UTILIDADES DE TIEMPO ---
DAYS_MAP = {"L": 0, "M": 1, "MI": 2, "J": 3, "V": 4, "S": 5, "D": 6}

def parse_days(days_str: str) -> List[int]:
    try:
        days_str = str(days_str).upper().strip()
        if "-" in days_str:
            start, end = days_str.split("-")
            return list(range(DAYS_MAP.get(start.strip(), 0), DAYS_MAP.get(end.strip(), 4) + 1))
        return [DAYS_MAP.get(d.strip(), 0) for d in days_str.split(",") if d.strip() in DAYS_MAP]
    except: return [0,1,2,3,4]

# --- MOTOR DE AUTOMATIZACIÓN (SQLite Only) ---
async def automation_engine():
    while True:
        await asyncio.sleep(120) 
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active: continue

            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            
            # Reset diario (medianoche CDMX)
            if now.hour == 0 and now.minute < 3:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.commit()

            async with httpx.AsyncClient() as client:
                res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                    "fields": "id,status,daily_budget,insights.date_preset(today){spend}",
                    "access_token": ACCESS_TOKEN, "limit": "500"
                })
                meta_data = res.json().get("data", [])
                
                for ad in meta_data:
                    if ad['id'] not in ALLOWED_ADSET_IDS: continue
                    s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
                    if not s or s.is_frozen: continue

                    # Lógica de Horario L-V (Simplificada para el motor)
                    curr_day = now.weekday()
                    active_days = parse_days(s.turno)
                    
                    # Por ahora el motor asume horario laboral si está en el día correcto
                    in_time = curr_day in active_days 
                    
                    spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    over_limit = (spend / budget * 100) >= s.limit_perc if budget > 0 else False

                    should_be_active = in_time and not over_budget
                    is_active = ad['status'] == 'ACTIVE'

                    if should_be_active and not is_active:
                        await client.post(f"{BASE_URL}/{ad['id']}", params={"status": "ACTIVE", "access_token": ACCESS_TOKEN})
                    elif not should_be_active and is_active:
                        await client.post(f"{BASE_URL}/{ad['id']}", params={"status": "PAUSED", "access_token": ACCESS_TOKEN})
        except Exception as e: print(f"Engine Error: {e}")
        finally: db.close()

# --- API ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    db = SessionLocal()
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))
        db.commit()
    db.close()
    asyncio.create_task(automation_engine())

# --- ENDPOINTS DE CONTROL ---

@app.get("/auth/auditors")
async def get_auditors():
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    creds_dict = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
    creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    return {"auditors": [row[0] for row in res.get('values', [])[1:] if row]}

@app.post("/auth/login")
async def login(req: dict):
    # Lógica de validación de Sheets... (abreviado)
    return {"status": "success", "user": req['nombre']}

@app.get("/ads/sync")
async def full_sync():
    """Retorna datos de Meta + Configuración de SQLite"""
    db = SessionLocal()
    try:
        # 1. Meta
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                "fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions}",
                "limit": "500", "access_token": ACCESS_TOKEN
            })
            meta = res.json().get("data", [])
        
        # 2. SQLite Settings
        settings = {s.id: {"limit_perc": s.limit_perc, "turno": s.turno, "is_frozen": s.is_frozen} 
                    for s in db.query(AdSetSetting).all()}
        
        # 3. Automation State
        auto = db.query(AutomationState).first()
        
        # 4. Logs
        logs = db.query(ActionLog).order_by(ActionLog.time.desc()).limit(5).all()
        logs_list = [{"user": l.user, "msg": l.msg, "time": l.time.isoformat()} for l in logs]

        return {
            "meta": meta,
            "settings": settings,
            "automation_active": auto.is_active if auto else False,
            "logs": logs_list
        }
    finally: db.close()

@app.post("/ads/update")
async def update_adset(req: dict):
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if not s:
            s = AdSetSetting(id=req['id'])
            db.add(s)
        
        if 'limit_perc' in req: s.limit_perc = float(req['limit_perc'])
        if 'turno' in req: s.turno = req['turno']
        if 'is_frozen' in req: s.is_frozen = bool(req['is_frozen'])
        
        if 'log' in req:
            db.add(ActionLog(user=req['user'], msg=req['log']))
            
        db.commit()
        return {"status": "ok"}
    finally: db.close()

@app.post("/ads/automation/toggle")
async def toggle_auto(req: dict):
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        auto.is_active = not auto.is_active
        db.add(ActionLog(user=req['user'], msg=f"{'Encendió' if auto.is_active else 'Apagó'} la automatización"))
        db.commit()
        return {"is_active": auto.is_active}
    finally: db.close()