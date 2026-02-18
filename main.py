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

# --- CONSTANTES ---
ALLOWED_ADSET_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
]

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

Base.metadata.create_all(bind=engine)

# --- ADQUISICIÓN DE CREDENCIALES DE GOOGLE ---
def get_google_creds():
    """
    Construye las credenciales de Service Account.
    Asegúrate de que el .env en Docker contenga las variables correctas.
    """
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    if creds_b64:
        try:
            creds_json = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
            return service_account.Credentials.from_service_account_info(
                creds_json, 
                scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
            )
        except Exception as e:
            print(f"DEBUG: Error decodificando Base64: {e}")

    # Fallback: Variables individuales
    try:
        raw_key = os.environ.get("GOOGLE_PRIVATE_KEY", "")
        # Limpieza profunda de la clave para evitar errores de formato en Docker
        formatted_key = raw_key.replace('\\n', '\n').replace('"', '').replace("'", "").strip()
        
        info = {
            "type": "service_account",
            "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
            "private_key_id": os.environ.get("PROJECT_PRIVATE_KEY_ID"),
            "private_key": formatted_key,
            "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
            "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.environ.get("GOOGLE_CLIENT_X509_CERT_URL")
        }
        
        if not info["private_key"] or not info["client_email"]:
            print(f"DEBUG: Faltan credenciales (Email: {bool(info['client_email'])}, Key: {bool(info['private_key'])})")
            return None
            
        return service_account.Credentials.from_service_account_info(
            info, 
            scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
        )
    except Exception as e:
        print(f"DEBUG: Error construyendo credenciales: {e}")
    
    return None

# --- CONFIGURACIÓN META ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"

# --- MOTOR DE AUTOMATIZACIÓN ---
async def run_automation_loop():
    while True:
        await asyncio.sleep(300) 
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active: continue

            print(f"[{datetime.now()}] Motor de Automatización verificando reglas...")
            turns = {t.name: t for t in db.query(TurnConfig).all()}
            settings = {s.id: s for s in db.query(AdSetSetting).all() if s.id in ALLOWED_ADSET_IDS}
            
            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            curr_h = now.hour + (now.minute / 60)
            weekday = now.weekday() 

            async with httpx.AsyncClient() as client:
                res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                    "fields": "id,status,daily_budget,insights.date_preset(today){spend}",
                    "access_token": ACCESS_TOKEN, "limit": "500"
                })
                adsets_meta = res.json().get("data", [])

                for ad in adsets_meta:
                    sid = ad['id']
                    if sid not in ALLOWED_ADSET_IDS or sid not in settings: continue
                    s = settings[sid]
                    if s.is_frozen: continue 

                    assigned_turns = [t.strip().lower() for t in s.turno.split(',')]
                    in_time = False
                    for turn_name in assigned_turns:
                        t_conf = turns.get(turn_name)
                        if t_conf:
                            is_weekend = (t_conf.name == "fsemana" and weekday >= 5)
                            is_weekday = (t_conf.name != "fsemana" and weekday < 5)
                            if (is_weekday or is_weekend) and (t_conf.start_hour <= curr_h < t_conf.end_hour):
                                in_time = True
                                break

                    ins = ad.get("insights", {}).get("data", [{}])[0]
                    spend = float(ins.get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    over_budget = (spend / budget * 100) >= s.limit_perc if budget > 0 else False

                    should_be_active = in_time and not over_budget
                    current_active = ad['status'] == 'ACTIVE'

                    if should_be_active and not current_active:
                        await client.post(f"{BASE_URL}/{sid}", params={"status": "ACTIVE", "access_token": ACCESS_TOKEN})
                    elif not should_be_active and current_active:
                        await client.post(f"{BASE_URL}/{sid}", params={"status": "PAUSED", "access_token": ACCESS_TOKEN})
        except Exception as e:
            print(f"DEBUG: Error en Loop: {e}")
        finally:
            db.close()

app = FastAPI(title="Meta Control Pro v4.4", version="4.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    if not db.query(TurnConfig).first():
        defaults = [
            TurnConfig(name="matutino", start_hour=6.0, end_hour=13.0, days="L-V"),
            TurnConfig(name="vespertino", start_hour=13.0, end_hour=20.5, days="L-V"),
            TurnConfig(name="fsemana", start_hour=8.0, end_hour=14.0, days="S")
        ]
        db.add_all(defaults); db.commit()
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False)); db.commit()
    db.close()
    asyncio.create_task(run_automation_loop())

# --- LÓGICA DE SHEETS ---
async def get_auditors_from_sheets():
    try:
        creds = get_google_creds()
        if not creds: return []
        service = build('sheets', 'v4', credentials=creds)
        result = service.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range="Auditores!A:B"
        ).execute()
        values = result.get('values', [])
        if not values or len(values) < 2: return []
        headers = values[0] # Nombre, Contraseña
        return [{headers[0]: r[0], headers[1]: r[1]} for r in values[1:] if len(r) >= 2]
    except Exception as e:
        print(f"DEBUG: Error Sheets API: {e}")
        return []

@app.get("/auth/auditors")
async def list_auditors():
    data = await get_auditors_from_sheets()
    return {"auditors": [r['Nombre'] for r in data if 'Nombre' in r]}

@app.post("/auth/login")
async def login(req: dict):
    data = await get_auditors_from_sheets()
    for row in data:
        if str(row.get('Nombre')) == str(req.get('nombre')) and str(row.get('Contraseña')) == str(req.get('password')):
            return {"status": "success", "user": row.get('Nombre')}
    raise HTTPException(status_code=401, detail="Credenciales inválidas")

@app.get("/ads/sync")
async def sync_data():
    db = SessionLocal()
    try:
        auto = db.query(AutomationState).first()
        turns = db.query(TurnConfig).all()
        turn_data = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in turns}
        
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                "fields": "id,name,status,daily_budget,bid_amount,insights.date_preset(today){spend,actions,impressions,cpc,ctr}",
                "limit": "500", "access_token": ACCESS_TOKEN
            })
            meta_adsets = res.json().get("data", [])

        results = []
        for ad in meta_adsets:
            sid = str(ad['id'])
            if sid not in ALLOWED_ADSET_IDS: continue
            s = db.query(AdSetSetting).filter(AdSetSetting.id == sid).first()
            if not s:
                s = AdSetSetting(id=sid); db.add(s); db.commit()
            results.append({"meta": ad, "settings": {"turno": s.turno, "limit_perc": s.limit_perc, "is_frozen": s.is_frozen}})

        return {"adsets": results, "turns": turn_data, "automation_active": auto.is_active if auto else False}
    finally:
        db.close()

@app.post("/ads/settings/update")
async def update_setting(req: dict):
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if not s: return {"status": "error"}
        if req['key'] == 'turno': s.turno = req['value']
        elif req['key'] == 'limit_perc': s.limit_perc = float(req['value'])
        elif req['key'] == 'is_frozen': s.is_frozen = (str(req['value']).lower() == 'true')
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