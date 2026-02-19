import os
import asyncio
import httpx
import base64
import json
import pytz
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DE BASE DE DATOS (SQLite) ---
DATABASE_URL = "sqlite:///./meta_control.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS SQL ---
class AdSetSetting(Base):
    __tablename__ = "adset_settings"
    id = Column(String, primary_key=True, index=True)
    turno = Column(String, default="matutino")
    limit_perc = Column(Float, default=50.0)
    is_frozen = Column(Boolean, default=False)

class TurnConfig(Base):
    __tablename__ = "turn_configs"
    name = Column(String, primary_key=True) 
    start_hour = Column(Float)
    end_hour = Column(Float)
    days = Column(String) 

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

# --- CONFIGURACIÓN META Y GOOGLE ---
META_ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
API_VERSION = "v21.0"

def get_google_creds():
    try:
        creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
        if creds_b64:
            info = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        else:
            info = {
                "type": os.environ.get("GOOGLE_TYPE"),
                "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
                "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n'),
                "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        return service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    except: return None

# --- MOTOR DE AUTOMATIZACIÓN (Punto 18) ---
async def automation_engine():
    timeout_meta = httpx.Timeout(60.0, read=60.0)
    while True:
        await asyncio.sleep(60) # Revisa cada minuto
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active: continue

            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            curr_h = now.hour + (now.minute / 60)
            curr_day = now.weekday() # 0=Lunes

            # Punto 8: Reset nocturno de congelados
            if now.hour == 0 and now.minute < 2:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.commit()

            turns = {t.name.lower(): t for t in db.query(TurnConfig).all()}

            async with httpx.AsyncClient(timeout=timeout_meta) as client:
                url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/adsets"
                params = {"fields": "id,status,daily_budget,insights.date_preset(today){spend}", "access_token": META_ACCESS_TOKEN, "limit": "500"}
                res = await client.get(url, params=params)
                meta_data = res.json().get("data", [])

                for ad in meta_data:
                    s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
                    if not s or s.is_frozen: continue

                    # Punto 4: Lógica de Turnos L-V, S, D
                    assigned = [t.strip().lower() for t in s.turno.split(",")]
                    in_time = False
                    for t_name in assigned:
                        t_cfg = turns.get(t_name)
                        if t_cfg:
                            # Lógica de días (L-V abarca L, M, Mi, J, V)
                            days_active = []
                            if "L-V" in t_cfg.days: days_active.extend([0,1,2,3,4])
                            if "S" in t_cfg.days: days_active.append(5)
                            if "D" in t_cfg.days: days_active.append(6)
                            
                            if curr_day in days_active and (t_cfg.start_hour <= curr_h < t_cfg.end_hour):
                                in_time = True; break
                    
                    spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    over_limit = (spend / budget * 100) >= s.limit_perc if budget > 0 else False

                    should_be_active = in_time and not over_limit
                    if should_be_active and ad['status'] != 'ACTIVE':
                        await client.post(f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", params={"status": "ACTIVE", "access_token": META_ACCESS_TOKEN})
                    elif not should_be_active and ad['status'] == 'ACTIVE':
                        await client.post(f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", params={"status": "PAUSED", "access_token": META_ACCESS_TOKEN})
        except Exception as e: logging.error(f"Engine Error: {e}")
        finally: db.close()

# --- API ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    db = SessionLocal()
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))
        db.add_all([
            TurnConfig(name="matutino", start_hour=6.0, end_hour=13.0, days="L-V"),
            TurnConfig(name="vespertino", start_hour=13.0, end_hour=21.0, days="L-V"),
            TurnConfig(name="fsemana", start_hour=8.0, end_hour=14.0, days="S")
        ])
    db.commit(); db.close()
    asyncio.create_task(automation_engine())

@app.get("/auth/auditors")
async def get_auditors():
    # Punto 1: Droplist desde Sheets
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    return {"auditors": [row[0] for row in res.get('values', [])[1:] if row]}

@app.post("/auth/login")
async def login(req: dict):
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    for row in res.get('values', [])[1:]:
        if row[0] == req['nombre'] and row[1] == req['password']:
            return {"user": row[0]}
    raise HTTPException(401)

@app.get("/ads/sync")
async def sync_data():
    db = SessionLocal()
    timeout_meta = httpx.Timeout(60.0, read=60.0)
    try:
        async with httpx.AsyncClient(timeout=timeout_meta) as client:
            url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/adsets"
            params = {"fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions}", "access_token": META_ACCESS_TOKEN, "limit": "500"}
            res = await client.get(url, params=params)
            meta = res.json().get("data", [])
        
        settings = {s.id: {"limit_perc": s.limit_perc, "turno": s.turno, "is_frozen": s.is_frozen} for s in db.query(AdSetSetting).all()}
        turns = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in db.query(TurnConfig).all()}
        auto = db.query(AutomationState).first()
        logs = db.query(ActionLog).order_by(ActionLog.id.desc()).limit(15).all()
        
        return {
            "meta": meta, "settings": settings, "turns": turns,
            "automation_active": auto.is_active if auto else False,
            "logs": [{"user": l.user, "msg": l.msg, "time": l.time.strftime("%H:%M:%S")} for l in logs]
        }
    finally: db.close()

@app.post("/ads/meta-status")
async def update_meta_status(req: dict):
    # Punto 2/3: Apagado/Encendido manual sincronizado e inmediato
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(f"https://graph.facebook.com/{API_VERSION}/{req['id']}", params={"status": req['status'], "access_token": META_ACCESS_TOKEN})
        if res.status_code == 200:
            db = SessionLocal()
            db.add(ActionLog(user=req['user'], msg=f"Cambió manualmente {req['id']} a {req['status']}"))
            db.commit(); db.close()
            return {"ok": True}
    return {"ok": False}

@app.post("/ads/update")
async def update_setting(req: dict):
    # Punto 9: Actualización para todos los usuarios
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if not s: s = AdSetSetting(id=req['id']); db.add(s)
        if 'limit_perc' in req: s.limit_perc = float(req['limit_perc'])
        if 'turno' in req: s.turno = req['turno']
        if 'is_frozen' in req: s.is_frozen = bool(req['is_frozen'])
        if 'log' in req: db.add(ActionLog(user=req['user'], msg=req['log']))
        db.commit()
        return {"ok": True}
    finally: db.close()

@app.post("/ads/bulk-update")
async def bulk_update(req: dict):
    # Punto 5: Modificación grupal
    db = SessionLocal()
    try:
        for sid in req['ids']:
            s = db.query(AdSetSetting).filter(AdSetSetting.id == sid).first()
            if not s: s = AdSetSetting(id=sid); db.add(s)
            s.limit_perc = float(req['limit_perc'])
        db.add(ActionLog(user=req['user'], msg=f"Aplicó límite masivo {req['limit_perc']}% a {len(req['ids'])} conjuntos"))
        db.commit()
        return {"ok": True}
    finally: db.close()

@app.post("/turns/update")
async def update_turn(req: dict):
    # Punto 4: Modificador de turnos
    db = SessionLocal()
    try:
        t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
        if not t: t = TurnConfig(name=req['name']); db.add(t)
        t.start_hour, t.end_hour, t.days = float(req['start']), float(req['end']), req['days']
        db.commit()
        return {"ok": True}
    finally: db.close()

@app.post("/ads/automation/toggle")
async def toggle_auto(req: dict):
    # Punto 2: Sync de switch de automatización entre auditores
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        auto.is_active = not auto.is_active
        db.add(ActionLog(user=req['user'], msg=f"{'Encendió' if auto.is_active else 'Apagó'} la automatización"))
        db.commit()
        return {"is_active": auto.is_active}
    finally: db.close()