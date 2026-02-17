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

# Librerías de Google Auth
from google.oauth2 import service_account
from googleapiclient.discovery import build

# SQLAlchemy
from sqlalchemy import create_engine, Column, String, Float, Boolean, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DE BASE DE DATOS ---
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./meta_control.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS SQL ---

class AdSetSetting(Base):
    """Configuraciones persistentes por AdSet"""
    __tablename__ = "adset_settings"
    id = Column(String, primary_key=True, index=True)
    turno = Column(String, default="matutino")
    limit_perc = Column(Float, default=50.0)
    is_frozen = Column(Boolean, default=False)

class TurnConfig(Base):
    """Configuración de horarios de turnos"""
    __tablename__ = "turn_configs"
    name = Column(String, primary_key=True) # matutino, vespertino, fsemana
    start_hour = Column(Float)
    end_hour = Column(Float)
    days = Column(String) # "L-V", "S", "D"

class AutomationState(Base):
    """Estado maestro de la automatización"""
    __tablename__ = "automation_state"
    id = Column(Integer, primary_key=True, default=1)
    is_active = Column(Boolean, default=False)

class DailyHistory(Base):
    """Respaldo histórico (Corte 11 PM)"""
    __tablename__ = "daily_history"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    adset_id = Column(String)
    adset_name = Column(String)
    spend = Column(Float)
    results = Column(Integer)
    impressions = Column(Integer)

Base.metadata.create_all(bind=engine)

# Inicializar turnos por defecto si no existen
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
    db.close()

init_db()

# --- APP INIT ---
app = FastAPI(title="Meta Control SQL Pro v3.5", version="3.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURACIÓN DE SEGURIDAD (GOOGLE API) ---
def get_google_creds():
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    if creds_b64:
        creds_json = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        return service_account.Credentials.from_service_account_info(
            creds_json, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
        )
    
    info = {
        "type": os.environ.get("GOOGLE_TYPE"),
        "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
        "private_key_id": os.environ.get("PROJECT_PRIVATE_KEY_ID"),
        "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n'),
        "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": os.environ.get("GOOGLE_CLIENT_X509_CERT_URL")
    }
    return service_account.Credentials.from_service_account_info(
        info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
    )

SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
RANGE_NAME = "Auditores!A:B"

# --- META CONFIG ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# --- SCHEMAS ---
class SettingUpdate(BaseModel):
    id: str
    key: str
    value: str

class TurnUpdate(BaseModel):
    name: str
    start_hour: float
    end_hour: float
    days: str

class LoginRequest(BaseModel):
    nombre: str
    password: str

# --- LÓGICA DE AUDITORES ---
async def get_auditors_from_api():
    try:
        creds = get_google_creds()
        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()
        result = sheet.values().get(spreadsheetId=SHEET_ID, range=RANGE_NAME).execute()
        values = result.get('values', [])
        if not values: return []
        headers = values[0]
        data = []
        for row in values[1:]:
            if len(row) >= 2:
                data.append({headers[0]: row[0], headers[1]: row[1]})
        return data
    except Exception as e:
        print(f"Error en Google API: {e}")
        return []

@app.get("/auth/auditors")
async def list_auditors():
    data = await get_auditors_from_api()
    nombres = [row['Nombre'] for row in data if 'Nombre' in row]
    return {"auditors": nombres}

@app.post("/auth/login")
async def login(req: LoginRequest):
    data = await get_auditors_from_api()
    for row in data:
        if row.get('Nombre') == req.nombre and row.get('Contraseña') == req.password:
            return {"status": "success", "user": req.nombre}
    raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

# --- LÓGICA DE NEGOCIO ---
@app.get("/ads/sync")
async def sync_data():
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        if not auto:
            auto = AutomationState(id=1, is_active=False)
            db.add(auto)
            db.commit()

        # Obtener configuraciones de turnos
        turns = db.query(TurnConfig).all()
        turn_data = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in turns}

        fields = "id,name,status,daily_budget,bid_amount,insights.date_preset(today){spend,actions,impressions,cpc,ctr}"
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                "fields": fields, "limit": "100", "access_token": ACCESS_TOKEN
            })
            meta_adsets = res.json().get("data", [])

        results = []
        for ad in meta_adsets:
            setting = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
            if not setting:
                setting = AdSetSetting(id=ad['id'])
                db.add(setting)
                db.commit()
            
            results.append({
                "meta": ad,
                "settings": {
                    "turno": setting.turno,
                    "limit_perc": setting.limit_perc,
                    "is_frozen": setting.is_frozen
                }
            })

        mexico_tz = pytz.timezone('America/Mexico_City')
        return {
            "adsets": results,
            "turns": turn_data,
            "automation_active": auto.is_active,
            "server_time": datetime.now(mexico_tz).isoformat()
        }
    finally:
        db.close()

@app.post("/ads/turns/update")
async def update_turn(req: TurnUpdate):
    db = SessionLocal()
    try:
        turn = db.query(TurnConfig).filter(TurnConfig.name == req.name).first()
        if not turn: raise HTTPException(status_code=404)
        turn.start_hour = req.start_hour
        turn.end_hour = req.end_hour
        turn.days = req.days
        db.commit()
        return {"status": "updated"}
    finally:
        db.close()

@app.post("/ads/settings/update")
async def update_db_setting(req: SettingUpdate):
    db = SessionLocal()
    try:
        setting = db.query(AdSetSetting).filter(AdSetSetting.id == req.id).first()
        if not setting: raise HTTPException(status_code=404)
        if req.key == "turno": setting.turno = req.value
        elif req.key == "limit_perc": setting.limit_perc = float(req.value)
        elif req.key == "is_frozen": setting.is_frozen = (req.value.lower() == 'true')
        db.commit()
        return {"status": "updated"}
    finally:
        db.close()

@app.post("/ads/automation/toggle")
async def toggle_automation():
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        auto.is_active = not auto.is_active
        db.commit()
        return {"is_active": auto.is_active}
    finally:
        db.close()

@app.post("/ads/backup/daily")
async def trigger_nightly_backup(background_tasks: BackgroundTasks):
    async def run_backup():
        db = SessionLocal()
        fields = "id,name,insights.date_preset(today){spend,actions,impressions}"
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                "fields": fields, "limit": "100", "access_token": ACCESS_TOKEN
            })
            data = res.json().get("data", [])
            for item in data:
                ins = item.get("insights", {}).get("data", [{}])[0]
                history = DailyHistory(
                    adset_id=item['id'],
                    adset_name=item['name'],
                    spend=float(ins.get("spend", 0)),
                    results=int(ins.get("actions", [{}])[0].get("value", 0)),
                    impressions=int(ins.get("impressions", 0))
                )
                db.add(history)
            db.commit()
        db.close()
    background_tasks.add_task(run_backup)
    return {"status": "Backup task started"}