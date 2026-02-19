import os
import asyncio
import httpx
import base64
import json
import pytz
import logging
from datetime import datetime, time
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

# Carga de variables de entorno
load_dotenv()

# Configuración de Logs para depuración en el VPS
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- BASE DE DATOS SQLITE ---
DATABASE_URL = "sqlite:///./meta_control.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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

# --- CONFIGURACIÓN META Y GOOGLE ---
META_ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
API_VERSION = "v21.0"

ALLOWED_ADSET_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
]

# --- UTILIDADES ---
def get_google_creds():
    try:
        creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
        if creds_b64:
            creds_dict = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
            return service_account.Credentials.from_service_account_info(creds_dict, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
        
        info = {
            "type": os.environ.get("GOOGLE_TYPE", "service_account"),
            "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
            "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n'),
            "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        return service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    except Exception as e:
        logger.error(f"Error en credenciales Google: {e}")
        return None

# --- MOTOR DE AUTOMATIZACIÓN ---
async def automation_engine():
    while True:
        await asyncio.sleep(120) 
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active: continue

            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            
            # Reset Nocturno (00:00 CDMX)
            if now.hour == 0 and now.minute < 5:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.commit()

            async with httpx.AsyncClient() as client:
                url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/adsets"
                params = {
                    "fields": "id,status,daily_budget,insights.date_preset(today){spend}",
                    "access_token": META_ACCESS_TOKEN, "limit": "500"
                }
                res = await client.get(url, params=params)
                meta_data = res.json().get("data", [])

                for ad in meta_data:
                    sid = ad['id']
                    if sid not in ALLOWED_ADSET_IDS: continue
                    
                    s = db.query(AdSetSetting).filter(AdSetSetting.id == sid).first()
                    if not s or s.is_frozen: continue

                    # Lógica simplificada de días (L-V)
                    curr_day = now.weekday() # 0=Lunes, 6=Domingo
                    is_weekday = curr_day <= 4
                    
                    # Determinamos si el conjunto debe estar activo según turno/presupuesto
                    spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    limit = s.limit_perc
                    
                    over_budget = (spend / budget * 100) >= limit if budget > 0 else False
                    
                    # Regla básica: Activo en días de turno y si no supera el ppto
                    should_be_active = is_weekday and not over_budget
                    is_active = ad['status'] == 'ACTIVE'

                    if should_be_active and not is_active:
                        await client.post(f"https://graph.facebook.com/{API_VERSION}/{sid}", params={"status": "ACTIVE", "access_token": META_ACCESS_TOKEN})
                    elif not should_be_active and is_active:
                        await client.post(f"https://graph.facebook.com/{API_VERSION}/{sid}", params={"status": "PAUSED", "access_token": META_ACCESS_TOKEN})
        except Exception as e:
            logger.error(f"Error Motor: {e}")
        finally:
            db.close()

# --- APP FASTAPI ---
app = FastAPI()

# SOLUCIÓN AL ERROR DE CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://manejometa.libresdeumas.com",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    db = SessionLocal()
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))
        db.commit()
    db.close()
    asyncio.create_task(automation_engine())

# --- ENDPOINTS ---

@app.get("/auth/auditors")
async def get_auditors():
    creds = get_google_creds()
    if not creds: raise HTTPException(500, "Google Creds Error")
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    values = res.get('values', [])
    return {"auditors": [row[0] for row in values[1:] if row]}

@app.post("/auth/login")
async def login(req: dict):
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    for row in res.get('values', [])[1:]:
        if row[0] == req['nombre'] and row[1] == req['password']:
            return {"status": "success", "user": row[0]}
    raise HTTPException(401, "Invalid credentials")

@app.get("/ads/sync")
async def sync_data():
    db = SessionLocal()
    try:
        # 1. Datos Meta
        async with httpx.AsyncClient() as client:
            url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/adsets"
            params = {
                "fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions,impressions}",
                "limit": "500", "access_token": META_ACCESS_TOKEN
            }
            res = await client.get(url, params=params)
            if res.status_code != 200:
                logger.error(f"Meta API Error: {res.text}")
                raise HTTPException(500, "Error contactando con Meta API")
            meta = res.json().get("data", [])
        
        # 2. SQLite Settings y Logs
        settings = {s.id: {"limit_perc": s.limit_perc, "turno": s.turno, "is_frozen": s.is_frozen} for s in db.query(AdSetSetting).all()}
        auto = db.query(AutomationState).first()
        logs = db.query(ActionLog).order_by(ActionLog.id.desc()).limit(5).all()
        
        return {
            "meta": meta,
            "settings": settings,
            "automation_active": auto.is_active if auto else False,
            "logs": [{"user": l.user, "msg": l.msg, "time": l.time.strftime("%H:%M:%S")} for l in logs]
        }
    except Exception as e:
        logger.error(f"Sync Error: {e}")
        raise HTTPException(500, str(e))
    finally:
        db.close()

@app.post("/ads/update")
async def update_setting(req: dict):
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
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    finally:
        db.close()

@app.post("/ads/bulk-update")
async def bulk_update(req: dict):
    db = SessionLocal()
    try:
        for sid in req['ids']:
            s = db.query(AdSetSetting).filter(AdSetSetting.id == sid).first()
            if not s:
                s = AdSetSetting(id=sid)
                db.add(s)
            s.limit_perc = float(req['limit_perc'])
        
        db.add(ActionLog(user=req['user'], msg=f"Aplicó límite masivo {req['limit_perc']}% a {len(req['ids'])} conjuntos"))
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()

@app.post("/ads/automation/toggle")
async def toggle_auto(req: dict):
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        auto.is_active = not auto.is_active
        db.add(ActionLog(user=req['user'], msg=f"{'Encendió' if auto.is_active else 'Apagó'} la automatización"))
        db.commit()
        return {"is_active": auto.is_active}
    finally:
        db.close()