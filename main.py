import os
import asyncio
import httpx
from datetime import datetime
import pytz
from typing import List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_database_uri, create_engine, Column, String, Float, Boolean, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DE BASE DE DATOS (SQLite -> Preparado para PostgreSQL) ---
# Para pasar a PostgreSQL solo cambia esta URL en el .env
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./meta_control.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS SQL ---

class AdSetSetting(Base):
    """Configuraciones persistentes por AdSet (Turnos, Limites, Congelado)"""
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

# Crear tablas
Base.metadata.create_all(bind=engine)

# --- APP INIT ---
app = FastAPI(title="Meta Control SQL Pro", version="3.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Meta Config
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# --- SCHEMAS PADYNTIC ---
class SettingUpdate(BaseModel):
    id: str
    key: str
    value: str # O valor mixto, simplificado a string para el ejemplo

# --- LOGICA DE NEGOCIO ---

@app.get("/ads/sync")
async def sync_data():
    """Sincroniza datos de Meta con las configuraciones de la SQL local"""
    db = SessionLocal()
    try:
        # 1. Obtener estado de automatización
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
    """Actualiza un valor en la base de datos SQL"""
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
    """Enciende o apaga las reglas automáticas"""
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
    """
    Endpoint para el Respaldo de las 11 PM.
    Debe ser llamado por un CRON externo del VPS.
    """
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