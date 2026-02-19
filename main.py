import os
import asyncio
import httpx
import base64
import json
import pytz
import logging
import time
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DB ---
DATABASE_URL = "sqlite:///./meta_control.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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

# --- CONSTANTES ---
META_ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
API_VERSION = "v21.0"

meta_cache: Dict[str, Any] = {"data": None, "timestamp": 0}

# --- UTILIDADES GOOGLE SHEETS ---
def get_google_creds():
    try:
        creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
        if creds_b64:
            info = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        else:
            info = {
                "type": "service_account",
                "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
                "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n'),
                "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        return service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    except Exception as e:
        logging.error(f"Creds Error: {e}")
        return None

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup_event():
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=60.0))
    db = SessionLocal()
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))
    if not db.query(TurnConfig).first():
        db.add_all([
            TurnConfig(name="matutino", start_hour=6.0, end_hour=13.0, days="L-V"),
            TurnConfig(name="vespertino", start_hour=13.0, end_hour=21.0, days="L-V"),
            TurnConfig(name="fsemana", start_hour=8.0, end_hour=14.0, days="S")
        ])
    db.commit(); db.close()
    asyncio.create_task(automation_engine())

async def get_meta_data_cached():
    curr_time = time.time()
    if meta_cache["data"] and (curr_time - meta_cache["timestamp"] < 10):
        return meta_cache["data"]
    url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/adsets"
    params = {"fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions}", "access_token": META_ACCESS_TOKEN, "limit": "500"}
    try:
        res = await app.state.client.get(url, params=params)
        data = res.json().get("data", [])
        meta_cache["data"] = data
        meta_cache["timestamp"] = curr_time
        return data
    except: return meta_cache["data"] or []

# --- MOTOR DE AUTOMATIZACIÓN ---
async def automation_engine():
    while True:
        await asyncio.sleep(45)
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active: continue
            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            curr_h = now.hour + (now.minute / 60)
            turns = {t.name.lower(): t for t in db.query(TurnConfig).all()}
            meta_data = await get_meta_data_cached()
            for ad in meta_data:
                s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
                if not s or s.is_frozen: continue
                assigned = [t.strip().lower() for t in s.turno.split(",")]
                in_time = any(turns.get(t) and turns[t].start_hour <= curr_h < turns[t].end_hour for t in assigned)
                spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0)) if ad.get("insights") else 0
                budget = float(ad.get("daily_budget", 0)) / 100
                over = (spend / budget * 100) >= s.limit_perc if budget > 0 else False
                should_be_active = in_time and not over
                if should_be_active and ad['status'] != 'ACTIVE':
                    await app.state.client.post(f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", params={"status": "ACTIVE", "access_token": META_ACCESS_TOKEN})
                elif not should_be_active and ad['status'] == 'ACTIVE':
                    await app.state.client.post(f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", params={"status": "PAUSED", "access_token": META_ACCESS_TOKEN})
        except: pass
        finally: db.close()

# --- ENDPOINTS ---

@app.get("/ads/sync")
async def sync_data():
    db = SessionLocal()
    try:
        meta = await get_meta_data_cached()
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
    res = await app.state.client.post(f"https://graph.facebook.com/{API_VERSION}/{req['id']}", params={"status": req['status'], "access_token": META_ACCESS_TOKEN})
    if res.status_code == 200:
        db = SessionLocal()
        db.add(ActionLog(user=req['user'], msg=f"Manual: {req['status']} en {req['id']}"))
        db.commit(); db.close()
        meta_cache["timestamp"] = 0
        return {"ok": True}
    return {"ok": False}

@app.post("/ads/update")
async def update_setting(req: dict):
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if not s: s = AdSetSetting(id=req['id']); db.add(s)
        if 'limit_perc' in req: s.limit_perc = float(req['limit_perc'])
        if 'turno' in req: s.turno = req['turno']
        if 'is_frozen' in req: s.is_frozen = bool(req['is_frozen'])
        db.commit(); return {"ok": True}
    finally: db.close()

@app.post("/ads/bulk-update")
async def bulk_update(req: dict):
    db = SessionLocal()
    try:
        for sid in req['ids']:
            s = db.query(AdSetSetting).filter(AdSetSetting.id == sid).first()
            if not s: s = AdSetSetting(id=sid); db.add(s)
            s.limit_perc = float(req['limit_perc'])
        db.commit(); return {"ok": True}
    finally: db.close()

@app.post("/turns/update")
async def update_turn(req: dict):
    db = SessionLocal()
    try:
        t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
        if not t: t = TurnConfig(name=req['name']); db.add(t)
        t.start_hour, t.end_hour, t.days = float(req['start']), float(req['end']), req['days']
        db.commit(); return {"ok": True}
    finally: db.close()

@app.post("/ads/automation/toggle")
async def toggle_auto(req: dict):
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        auto.is_active = not auto.is_active
        db.add(ActionLog(user=req['user'], msg=f"{'Encendió' if auto.is_active else 'Apagó'} automatización"))
        db.commit(); return {"is_active": auto.is_active}
    finally: db.close()

@app.get("/auth/auditors")
async def get_auditors():
    creds = get_google_creds()
    if not creds: return {"auditors": ["Auditor Maestro"]}
    try:
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
        values = res.get('values', [])
        return {"auditors": [row[0] for row in values[1:] if row]}
    except: return {"auditors": ["Error al cargar"]}

@app.post("/auth/login")
async def login(req: dict):
    creds = get_google_creds()
    if not creds: raise HTTPException(401, "Configuración incompleta")
    try:
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
        values = res.get('values', [])
        for row in values[1:]:
            if row[0] == req['nombre'] and str(row[1]) == str(req['password']):
                return {"user": row[0]}
        raise HTTPException(401, "Credenciales inválidas")
    except: raise HTTPException(500, "Error de validación")