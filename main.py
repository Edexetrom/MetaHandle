import os
import asyncio
import httpx
import base64
import json
import pytz
import csv
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Google Auth Libraries
from google.oauth2 import service_account
from googleapiclient.discovery import build

# SQLAlchemy
from sqlalchemy import create_engine, Column, String, Float, Boolean, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# --- DATABASE CONFIGURATION ---
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./meta_control.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- SQL MODELS ---

class AdSetSetting(Base):
    __tablename__ = "adset_settings"
    id = Column(String, primary_key=True, index=True)
    turno = Column(String, default="matutino") # Ahora soporta valores como "matutino, fsemana"
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

class DailyHistory(Base):
    __tablename__ = "daily_history"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    adset_id = Column(String)
    adset_name = Column(String)
    spend = Column(Float)
    results = Column(Integer)
    impressions = Column(Integer)

Base.metadata.create_all(bind=engine)

# --- INITIALIZATION ---
def init_db():
    db = SessionLocal()
    if not db.query(TurnConfig).first():
        defaults = [
            TurnConfig(name="matutino", start_hour=6.0, end_hour=13.0, days="L-V"),
            TurnConfig(name="vespertino", start_hour=13.0, end_hour=20.5, days="L-V"),
            TurnConfig(name="fsemana", start_hour=8.0, end_hour=14.0, days="S")
        ]
        db.add_all(defaults)
        db.commit()
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))
        db.commit()
    db.close()

init_db()

app = FastAPI(title="Meta Control Pro v3.8", version="3.8.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GOOGLE & META CONFIG ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"

def get_google_creds():
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    if creds_b64:
        creds_json = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        return service_account.Credentials.from_service_account_info(creds_json, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    return None

# --- AUTOMATION ENGINE (EL MOTOR) ---

async def run_automation_loop():
    """
    Ciclo infinito que corre en el servidor.
    Se ejecuta cada 5 minutos para aplicar las reglas de negocio.
    """
    while True:
        await asyncio.sleep(300) # Espera 5 minutos
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active:
                continue

            print(f"[{datetime.now()}] Ejecutando Motor de Automatización...")
            
            # 1. Obtener Horarios y Configuración
            turns = {t.name: t for t in db.query(TurnConfig).all()}
            settings = {s.id: s for s in db.query(AdSetSetting).all()}
            
            # 2. Tiempo actual CDMX
            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            curr_h = now.hour + (now.minute / 60)
            weekday = now.weekday() # 0=Lun, 5=Sab, 6=Dom

            # 3. Datos de Meta
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                    "fields": "id,status,daily_budget,insights.date_preset(today){spend}",
                    "access_token": ACCESS_TOKEN
                })
                adsets_meta = res.json().get("data", [])

                for ad in adsets_meta:
                    sid = ad['id']
                    if sid not in settings: continue
                    
                    s = settings[sid]
                    if s.is_frozen: continue # Regla de Oro: Congelado se ignora

                    # Lógica de Turno (Múltiples turnos permitidos)
                    # Convertimos el string "matutino, fsemana" en una lista ["matutino", "fsemana"]
                    assigned_turn_names = [t.strip().lower() for t in s.turno.split(',')]
                    in_time = False
                    
                    for turn_name in assigned_turn_names:
                        t_conf = turns.get(turn_name)
                        if t_conf:
                            # Lógica por tipo de turno
                            is_weekend_rule = (t_conf.name == "fsemana" and weekday >= 5)
                            is_weekday_rule = (t_conf.name != "fsemana" and weekday < 5)
                            
                            if (is_weekday_rule or is_weekend_rule) and (t_conf.start_hour <= curr_h < t_conf.end_hour):
                                in_time = True
                                break # Si entra en un turno válido, activamos la bandera y salimos del bucle de turnos

                    # Lógica de Gasto (Stop-Loss)
                    ins = ad.get("insights", {}).get("data", [{}])[0]
                    spend = float(ins.get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    over_budget = (spend / budget * 100) >= s.limit_perc if budget > 0 else False

                    # Determinación de Estado Final
                    should_be_active = in_time and not over_budget
                    current_active = ad['status'] == 'ACTIVE'

                    # Ejecución en Meta solo si hay un cambio necesario
                    if should_be_active and not current_active:
                        await client.post(f"{BASE_URL}/{sid}", params={"status": "ACTIVE", "access_token": ACCESS_TOKEN})
                    elif not should_be_active and current_active:
                        await client.post(f"{BASE_URL}/{sid}", params={"status": "PAUSED", "access_token": ACCESS_TOKEN})

        except Exception as e:
            print(f"Error en loop de automatización: {e}")
        finally:
            db.close()

@app.on_event("startup")
async def startup_event():
    """Inicia el motor de automatización al arrancar el servidor"""
    asyncio.create_task(run_automation_loop())

# --- ENDPOINTS ---

@app.get("/ads/sync")
async def sync_data():
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        turns = db.query(TurnConfig).all()
        turn_data = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in turns}
        
        fields = "id,name,status,daily_budget,bid_amount,insights.date_preset(today){spend,actions,impressions,cpc,ctr}"
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={"fields": fields, "access_token": ACCESS_TOKEN})
            meta_adsets = res.json().get("data", [])

        results = []
        for ad in meta_adsets:
            s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
            if not s:
                s = AdSetSetting(id=ad['id'])
                db.add(s); db.commit()
            results.append({"meta": ad, "settings": {"turno": s.turno, "limit_perc": s.limit_perc, "is_frozen": s.is_frozen}})

        return {"adsets": results, "turns": turn_data, "automation_active": auto.is_active}
    finally:
        db.close()

@app.post("/ads/settings/update")
async def update_setting(req: dict):
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if req['key'] == 'turno': s.turno = req['value']
        elif req['key'] == 'limit_perc': s.limit_perc = float(req['value'])
        elif req['key'] == 'is_frozen': s.is_frozen = req['value'] == 'true'
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()

@app.post("/ads/automation/toggle")
async def toggle_auto():
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        auto.is_active = not auto.is_active
        db.commit()
        return {"is_active": auto.is_active}
    finally:
        db.close()

@app.post("/ads/settings/update_meta")
async def update_meta(req: dict):
    async with httpx.AsyncClient() as client:
        await client.post(f"{BASE_URL}/{req['id']}", params={"status": req['status'], "access_token": ACCESS_TOKEN})
    return {"status": "ok"}

@app.post("/ads/turns/update")
async def update_turn(req: dict):
    db = SessionLocal()
    try:
        t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
        t.start_hour = float(req['start_hour'])
        t.end_hour = float(req['end_hour'])
        t.days = req['days']
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()