import os
import asyncio
import httpx
import csv
import pytz
from datetime import datetime
from typing import List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Float, Boolean, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DE BASE DE DATOS (SQLite -> Preparado para PostgreSQL) ---
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./meta_control.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS SQL ---

class AdSetSetting(Base):
    """Configuraciones persistentes por AdSet (Turnos, Límites, Congelado)"""
    __tablename__ = "adset_settings"
    id = Column(String, primary_key=True, index=True)
    turno = Column(String, default="matutino")
    limit_perc = Column(Float, default=50.0)
    is_frozen = Column(Boolean, default=False)

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

# Crear tablas si no existen
Base.metadata.create_all(bind=engine)

# --- APP INIT ---
app = FastAPI(title="Meta Control SQL Pro v3.3", version="3.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURACIÓN GOOGLE SHEETS (AUDITORES) ---
# Usamos el export CSV para leer los datos sin necesidad de OAuth complejo
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
SHEET_GID = "0"
AUDITORS_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"

# --- META CONFIG ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# --- SCHEMAS PADYNTIC ---
class SettingUpdate(BaseModel):
    id: str
    key: str
    value: str

class LoginRequest(BaseModel):
    nombre: str
    password: str

# --- LÓGICA DE AUTENTICACIÓN (GOOGLE SHEETS) ---

async def get_auditors_data():
    """Descarga y parsea la hoja de Auditores desde Google Sheets"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(AUDITORS_CSV_URL)
            if response.status_code != 200:
                return []
            
            decoded_content = response.content.decode('utf-8')
            reader = csv.DictReader(decoded_content.splitlines())
            # Se esperan columnas: "Nombre" y "Contraseña"
            return list(reader)
        except Exception as e:
            print(f"Error leyendo Google Sheets: {e}")
            return []

@app.get("/auth/auditors")
async def list_auditors():
    """Retorna la lista de nombres para el desplegable del login"""
    data = await get_auditors_data()
    nombres = [row['Nombre'] for row in data if 'Nombre' in row]
    return {"auditors": nombres}

@app.post("/auth/login")
async def login(req: LoginRequest):
    """Valida las credenciales contra la hoja de Google Sheets"""
    data = await get_auditors_data()
    for row in data:
        if row.get('Nombre') == req.nombre and row.get('Contraseña') == req.password:
            return {"status": "success", "user": req.nombre}
    
    raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

# --- LÓGICA DE NEGOCIO (META & SQL) ---

@app.get("/ads/sync")
async def sync_data():
    """Sincroniza datos de Meta con las configuraciones SQL"""
    db = SessionLocal()
    try:
        # 1. Estado de automatización
        auto = db.query(AutomationState).first()
        if not auto:
            auto = AutomationState(id=1, is_active=False)
            db.add(auto)
            db.commit()

        # 2. Llamada a Meta
        fields = "id,name,status,daily_budget,bid_amount,insights.date_preset(today){spend,actions,impressions,cpc,ctr}"
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                "fields": fields, "limit": "100", "access_token": ACCESS_TOKEN
            })
            meta_adsets = res.json().get("data", [])

        # 3. Mezclar con settings de SQL
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

        return {
            "adsets": results,
            "automation_active": auto.is_active,
            "server_time": datetime.now(pytz.timezone('America/Mexico_City')).isoformat()
        }
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
        elif req.key == "is_frozen": setting.is_frozen = req.value.lower() == 'true'
        
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
    """Respaldo de las 11 PM (Debe ser llamado por CRON)"""
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