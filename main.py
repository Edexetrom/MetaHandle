import os
import asyncio
import httpx
import base64
import json
import pytz
import logging
import time
from datetime import datetime
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv, dotenv_values

load_dotenv()

def get_meta_token():
    """Lee el token dinámicamente del .env para no requerir reinicios del sistema"""
    config = dotenv_values(".env")
    return config.get("META_ACCESS_TOKEN", os.environ.get("META_ACCESS_TOKEN", "")).strip()

def get_meta_ad_account_id():
    """Lee el ID de la cuenta publicitaria dinámicamente"""
    config = dotenv_values(".env")
    return config.get("META_AD_ACCOUNT_ID", os.environ.get("META_AD_ACCOUNT_ID", "")).strip()

# --- 1. CONFIGURACIÓN DB Y MODELOS ---
DATABASE_URL = "sqlite:///./meta_control.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class AdSetSetting(Base):
    """Configuración individual de cada Conjunto de Anuncios"""
    __tablename__ = "adset_settings"
    id = Column(String, primary_key=True, index=True)
    turno = Column(String, default="")
    limit_perc = Column(Float, default=0.0)
    is_frozen = Column(Boolean, default=False)

class TurnConfig(Base):
    """Configuración general de horarios para los turnos"""
    __tablename__ = "turn_configs"
    name = Column(String, primary_key=True) 
    start_hour = Column(Float)
    end_hour = Column(Float)
    days = Column(String) 

class HolidayConfig(Base):
    """Fechas festivas (Blackout Dates) formato YYYY-MM-DD"""
    __tablename__ = "holiday_configs"
    date = Column(String, primary_key=True)

class AutomationState(Base):
    """Estado general del motor de reglas"""
    __tablename__ = "automation_state"
    id = Column(Integer, primary_key=True, default=1)
    is_active = Column(Boolean, default=False)

class ActionLog(Base):
    """Registro de acciones manuales y automáticas"""
    __tablename__ = "action_logs"
    id = Column(Integer, primary_key=True, index=True)
    user = Column(String)
    msg = Column(String)
    time = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# --- 2. CONSTANTES ---
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
API_VERSION = "v21.0"

# Listado estricto permitido por negocio
ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
]

meta_cache: Dict[str, Any] = {"data": None, "timestamp": 0}

def get_google_creds():
    """Genera las credenciales para leer Google Sheets"""
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

# --- 3. EVENTOS DE INICIO Y MAPEO ESTRICTO ---
@app.on_event("startup")
async def startup_event():
    """Inicializa la DB, mapea grupos por defecto y lanza el motor"""
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=60.0))
    db = SessionLocal()
    
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))

    # Definición de Grupos Estrictos (Reglas de Negocio)
    g_vespertino = ["120232204774590717", "120233611687810717"]
    g_vesp_fsemana = ["120232204774610717", "120232157515490717"]
    g_matutinos = ["120234721717970717", "120234721717950717", "120233618279570717", "120233618279540717", "120232204774570717", "120232204774610717"]
    g_nocturno = ["120238886501840717", "120238886472900717", "120238886420220717", "120238886413960717", "120232157515490717", "120232157515460717"]

    # Procesar la inicialización de AdSets permitidos
    for ad_id in ALLOWED_IDS:
        if not db.query(AdSetSetting).filter_by(id=ad_id).first():
            if ad_id in g_vespertino:
                db.add(AdSetSetting(id=ad_id, turno="vespertino", limit_perc=85.0))
            elif ad_id in g_vesp_fsemana:
                db.add(AdSetSetting(id=ad_id, turno="vespertino,fsemana", limit_perc=85.0))
            elif ad_id in g_matutinos:
                db.add(AdSetSetting(id=ad_id, turno="matutino", limit_perc=60.0))
            elif ad_id in g_nocturno:
                db.add(AdSetSetting(id=ad_id, turno="nocturno", limit_perc=80.0))
            else:
                # Regla de Exclusión: Está permitido, pero no tiene grupo
                db.add(AdSetSetting(id=ad_id, turno="", limit_perc=0.0))

    # Sobrescritura forzada de turnos por defecto para asegurar cumplimiento horario
    default_turns = {
        "matutino": {"start_hour": 6.5, "end_hour": 13.0, "days": "M,X,J,V"},
        "especial": {"start_hour": 5.5, "end_hour": 13.0, "days": "L"},
        "vespertino": {"start_hour": 11.0, "end_hour": 19.0, "days": "L,M,X,J,V"},
        "nocturno": {"start_hour": 15.0, "end_hour": 22.0, "days": "L,M,X,J,V"},
        "fsemana": {"start_hour": 7.0, "end_hour": 17.0, "days": "S"}
    }
    
    for k, v in default_turns.items():
        t = db.query(TurnConfig).filter_by(name=k).first()
        if not t:
            db.add(TurnConfig(name=k, **v))
        else:
            t.start_hour = v["start_hour"]
            t.end_hour = v["end_hour"]
            t.days = v["days"]

    db.commit(); db.close()
    asyncio.create_task(automation_engine())

@app.on_event("shutdown")
async def shutdown_event():
    await app.state.client.aclose()

async def get_meta_data_cached():
    """Trae datos de Meta incluyendo Bid y Ads. Mantiene caché de 10s para rendimiento."""
    curr_time = time.time()
    if meta_cache["data"] and (curr_time - meta_cache["timestamp"] < 10):
        return meta_cache["data"]
    
    # NUEVOS CAMPOS: bid_amount, issues_info, ads{id,name,status}
    fields = "id,name,status,daily_budget,bid_amount,issues_info,insights.date_preset(today){spend,actions},ads{id,name,status}"
    account_id = get_meta_ad_account_id()
    url = f"https://graph.facebook.com/{API_VERSION}/{account_id}/adsets"
    params = {"fields": fields, "access_token": get_meta_token(), "limit": "500"}
    
    try:
        res = await app.state.client.get(url, params=params)
        json_res = res.json()
        if "error" in json_res:
            logging.error(f"Meta API Error in get_meta_data: {json_res['error']}")
            return meta_cache["data"] or []
            
        data = json_res.get("data", [])
        meta_cache["data"] = data
        meta_cache["timestamp"] = curr_time
        return data
    except Exception as e: 
        logging.error(f"Error caché Meta: {e}")
        return meta_cache["data"] or []

# --- 4. MOTOR DE AUTOMATIZACIÓN AVANZADO ---
async def automation_engine():
    """Valida reglas, doble reseteo y Días Festivos (Blackout)"""
    while True:
        await asyncio.sleep(45)
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state: continue
            
            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            
            # 1. DOBLE RESETEO (Freeze): 00:00 y 04:00 AM
            if now.hour in [0, 4] and now.minute < 2:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.commit()

            # 2. BLACKOUT DATES (Días festivos)
            today_str = now.strftime('%Y-%m-%d')
            is_holiday = db.query(HolidayConfig).filter(HolidayConfig.date == today_str).first() is not None

            # Si la automatización está apagada, no procesamos adsets
            if not state.is_active: 
                continue

            curr_h = now.hour + (now.minute / 60)
            day_of_week = now.weekday() 
            
            turns = {t.name.lower(): t for t in db.query(TurnConfig).all()}
            meta_data = await get_meta_data_cached()
            
            for ad in meta_data:
                try:
                    s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
                    if not s or s.is_frozen: continue
                    
                    # Regla: Si es festivo, la automatización asume que NO es tiempo de encender.
                    in_time = False 

                    if not is_holiday:
                        assigned = [t.strip().lower() for t in s.turno.split(",") if t.strip()]
                        for t_name in assigned:
                            turn = turns.get(t_name)
                            if not turn: continue
                            
                            # Validar hora
                            time_match = turn.start_hour <= curr_h < turn.end_hour
                            
                            # Validar día específico
                            day_match = False
                            days_cfg = turn.days.upper().strip()
                            day_map = {'L': 0, 'M': 1, 'X': 2, 'J': 3, 'V': 4, 'S': 5, 'D': 6}
                            target_days = [day_map.get(d.strip()) for d in days_cfg.split(',') if d.strip() in day_map]
                            
                            if target_days:
                                day_match = day_of_week in target_days
                            elif days_cfg == "L-V":
                                day_match = 0 <= day_of_week <= 4
                            else:
                                day_match = True # Fallback por si hay malformación
                            
                            if time_match and day_match:
                                in_time = True
                                break

                    # Control de Presupuesto (Stop-Loss)
                    insights_data = ad.get("insights", {}).get("data", []) if ad.get("insights") else []
                    spend = float(insights_data[0].get("spend", 0)) if insights_data and len(insights_data) > 0 else 0.0
                    
                    daily_budget_raw = ad.get("daily_budget")
                    budget = float(daily_budget_raw) / 100 if daily_budget_raw else 0.0
                    
                    over = (spend / budget * 100) >= s.limit_perc if budget > 0 else False
                    
                    should_be_active = in_time and not over
                    token = get_meta_token()
                    
                    if should_be_active and ad['status'] != 'ACTIVE':
                        await app.state.client.post(f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", params={"status": "ACTIVE", "access_token": token})
                    elif not should_be_active and ad['status'] == 'ACTIVE':
                        await app.state.client.post(f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", params={"status": "PAUSED", "access_token": token})
                except Exception as ad_err:
                    logging.error(f"Error procesando AdSet {ad.get('id')}: {ad_err}")
        except Exception as e:
            logging.error(f"Automation Engine Error: {e}")
        finally: db.close()

# --- 5. ENDPOINTS DE LA API ---

@app.get("/")
async def root():
    """Endpoint de bienvenida (Health Check)"""
    return {
        "status": "ok", 
        "message": "Meta Control API v3.0 funcionando correctamente. Visita /docs para probar los endpoints."
    }

@app.get("/ads/sync")
async def sync_data():
    """Sincronización central (UI)"""
    db = SessionLocal()
    try:
        meta = await get_meta_data_cached()
        settings = {s.id: {"limit_perc": s.limit_perc, "turno": s.turno, "is_frozen": s.is_frozen} for s in db.query(AdSetSetting).all()}
        turns = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in db.query(TurnConfig).all()}
        holidays = [h.date for h in db.query(HolidayConfig).all()]
        auto = db.query(AutomationState).first()
        logs = db.query(ActionLog).order_by(ActionLog.id.desc()).limit(15).all()
        return {
            "meta": meta, "settings": settings, "turns": turns, "holidays": holidays,
            "automation_active": auto.is_active if auto else False,
            "logs": [{"user": l.user, "msg": l.msg, "time": l.time.strftime("%H:%M:%S")} for l in logs]
        }
    finally: db.close()

@app.post("/ads/meta-status")
async def update_meta_status(req: dict):
    res = await app.state.client.post(f"https://graph.facebook.com/{API_VERSION}/{req['id']}", params={"status": req['status'], "access_token": get_meta_token()})
    if res.status_code == 200:
        db = SessionLocal()
        db.add(ActionLog(user=req['user'], msg=f"Manual: {req['status']} en {req['id']}"))
        db.commit(); db.close()
        meta_cache["timestamp"] = 0
        return {"ok": True}
    return {"ok": False}

@app.post("/ads/update")
async def update_setting(req: dict):
    """Actualiza la DB Local"""
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if not s: s = AdSetSetting(id=req['id']); db.add(s)
        if 'limit_perc' in req: s.limit_perc = float(req['limit_perc'])
        if 'turno' in req: s.turno = req['turno']
        if 'is_frozen' in req: s.is_frozen = bool(req['is_frozen'])
        db.commit(); return {"ok": True}
    finally: db.close()

@app.post("/ads/bid")
async def update_bid(req: dict):
    """Actualiza el límite de puja directamente en Meta API"""
    try:
        # Meta usa valores en su unidad base (centavos en muchas cuentas, o entero).
        # Enviaremos el valor entero que manda la interfaz.
        res = await app.state.client.post(
            f"https://graph.facebook.com/{API_VERSION}/{req['id']}", 
            params={"bid_amount": int(req['bid_amount']), "access_token": get_meta_token()}
        )
        if res.status_code == 200:
            db = SessionLocal()
            db.add(ActionLog(user=req['user'], msg=f"Bid actualizado a {req['bid_amount']} en {req['id']}"))
            db.commit(); db.close()
            meta_cache["timestamp"] = 0 # Invalidamos caché
            return {"ok": True}
        return {"ok": False, "error": res.text}
    except Exception as e:
        return {"ok": False, "error": str(e)}

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

@app.post("/ads/medios/toggle")
async def toggle_media(req: dict):
    """Apaga el anuncio B y enciende el anuncio A para rotación segura"""
    adset_id = req.get("adset_id")
    target_ad_id = req.get("target_ad_id")
    
    # 1. Traer todos los Ads del AdSet
    url = f"https://graph.facebook.com/{API_VERSION}/{adset_id}/ads"
    token = get_meta_token()
    try:
        res = await app.state.client.get(url, params={"fields": "id", "access_token": token})
        ads = res.json().get("data", [])
        
        # 2. Apagar los que NO sean el target_ad_id, encender el target
        for ad in ads:
            status = "ACTIVE" if str(ad["id"]) == str(target_ad_id) else "PAUSED"
            await app.state.client.post(
                f"https://graph.facebook.com/{API_VERSION}/{ad['id']}", 
                params={"status": status, "access_token": token}
            )
        
        db = SessionLocal()
        db.add(ActionLog(user=req['user'], msg=f"Rotó medios. Activo: {target_ad_id}"))
        db.commit(); db.close()
        meta_cache["timestamp"] = 0 # Limpia caché para reflejar visualmente
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# --- ENDPOINTS GESTIÓN FECHAS FESTIVAS ---
@app.post("/holidays/add")
async def add_holiday(req: dict):
    db = SessionLocal()
    try:
        if not db.query(HolidayConfig).filter_by(date=req['date']).first():
            db.add(HolidayConfig(date=req['date']))
            db.commit()
        return {"ok": True}
    finally: db.close()

@app.post("/holidays/delete")
async def delete_holiday(req: dict):
    db = SessionLocal()
    try:
        h = db.query(HolidayConfig).filter_by(date=req['date']).first()
        if h:
            db.delete(h)
            db.commit()
        return {"ok": True}
    finally: db.close()

# --- ENDPOINTS AUTENTICACIÓN Y EXTRAS ---
@app.post("/turns/update")
async def update_turn(req: dict):
    db = SessionLocal()
    try:
        t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
        if not t: t = TurnConfig(name=req['name']); db.add(t)
        t.start_hour, t.end_hour, t.days = float(req['start']), float(req['end']), req['days']
        db.commit(); return {"ok": True}
    finally: db.close()

@app.post("/turns/delete")
async def delete_turn(req: dict):
    db = SessionLocal()
    try:
        t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
        if t and t.name.lower() not in ["matutino", "especial", "vespertino", "nocturno", "fsemana"]:
            db.delete(t)
            db.commit()
            return {"ok": True}
        return {"ok": False}
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
        return {"auditors": [row[0] for row in res.get('values', [])[1:] if row]}
    except: return {"auditors": ["Error DB"]}

@app.post("/auth/login")
async def login(req: dict):
    creds = get_google_creds()
    if not creds: raise HTTPException(401, "Config error")
    try:
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
        for row in res.get('values', [])[1:]:
            if row[0] == req['nombre'] and str(row[1]) == str(req['password']):
                return {"user": row[0]}
        raise HTTPException(401, "Inválido")
    except: raise HTTPException(500, "Error")