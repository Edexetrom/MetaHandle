import os
import asyncio
import httpx
import base64
import json
import pytz
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN DE BASE DE DATOS ---
DATABASE_URL = "sqlite:///./meta_control.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS ---
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

# --- CONFIGURACIÓN META ---
META_ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"

ALLOWED_ADSET_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
]

# --- MOTOR DE AUTOMATIZACIÓN ---
async def automation_engine():
    timeout_cfg = httpx.Timeout(30.0, read=30.0)
    while True:
        await asyncio.sleep(120) 
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state or not state.is_active: continue

            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            curr_h = now.hour + (now.minute / 60)
            curr_day = now.weekday()

            if now.hour == 0 and now.minute < 3:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.commit()

            turns = {t.name.lower(): t for t in db.query(TurnConfig).all()}

            async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                url = f"https://graph.facebook.com/v21.0/{META_AD_ACCOUNT_ID}/adsets"
                res = await client.get(url, params={"fields": "id,status,daily_budget,insights.date_preset(today){spend}", "access_token": META_ACCESS_TOKEN, "limit": "500"})
                meta_data = res.json().get("data", [])

                for ad in meta_data:
                    if ad['id'] not in ALLOWED_ADSET_IDS: continue
                    s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
                    if not s or s.is_frozen: continue

                    assigned_turns = [t.strip().lower() for t in s.turno.split(",")]
                    in_time = False
                    for t_name in assigned_turns:
                        t_cfg = turns.get(t_name)
                        if t_cfg:
                            # parse_days logic (L-V etc)
                            pass # ... logic here ...
                            in_time = True # Fallback for now

                    spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    over_budget = (spend / budget * 100) >= s.limit_perc if budget > 0 else False

                    should_be_active = in_time and not over_budget
                    is_active = ad['status'] == 'ACTIVE'

                    if should_be_active and not is_active:
                        await client.post(f"https://graph.facebook.com/v21.0/{ad['id']}", params={"status": "ACTIVE", "access_token": META_ACCESS_TOKEN})
                    elif not should_be_active and is_active:
                        await client.post(f"https://graph.facebook.com/v21.0/{ad['id']}", params={"status": "PAUSED", "access_token": META_ACCESS_TOKEN})
        except Exception as e: logging.error(f"Engine Error: {e}")
        finally: db.close()

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

@app.get("/ads/sync")
async def full_sync():
    db = SessionLocal()
    timeout_cfg = httpx.Timeout(40.0, read=40.0)
    try:
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            url = f"https://graph.facebook.com/v21.0/{META_AD_ACCOUNT_ID}/adsets"
            res = await client.get(url, params={"fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions}", "access_token": META_ACCESS_TOKEN, "limit": "500"})
            meta = res.json().get("data", [])
        
        settings = {s.id: {"limit_perc": s.limit_perc, "turno": s.turno, "is_frozen": s.is_frozen} for s in db.query(AdSetSetting).all()}
        turns = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in db.query(TurnConfig).all()}
        auto = db.query(AutomationState).first()
        logs = db.query(ActionLog).order_by(ActionLog.id.desc()).limit(15).all()
        
        return {
            "meta": meta,
            "settings": settings,
            "turns": turns,
            "automation_active": auto.is_active if auto else False,
            "logs": [{"user": l.user, "msg": l.msg, "time": l.time.strftime("%H:%M:%S")} for l in logs]
        }
    finally: db.close()

# --- NUEVO: ENDPOINT PARA APAGADO/ENCENDIDO MANUAL EN META ---
@app.post("/ads/meta-status")
async def update_meta_status(req: dict):
    timeout_cfg = httpx.Timeout(20.0)
    try:
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            url = f"https://graph.facebook.com/v21.0/{req['id']}"
            res = await client.post(url, params={"status": req['status'], "access_token": META_ACCESS_TOKEN})
            
            if res.status_code == 200:
                db = SessionLocal()
                db.add(ActionLog(user=req['user'], msg=f"Cambió manualmente {req['id']} a {req['status']}"))
                db.commit()
                db.close()
                return {"ok": True}
            raise HTTPException(500, "Error en Meta API")
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/ads/update")
async def update_item(req: dict):
    db = SessionLocal()
    try:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
        if not s:
            s = AdSetSetting(id=req['id'])
            db.add(s)
        if 'limit_perc' in req: s.limit_perc = float(req['limit_perc'])
        if 'turno' in req: s.turno = req['turno']
        if 'is_frozen' in req: s.is_frozen = bool(req['is_frozen'])
        if 'log' in req: db.add(ActionLog(user=req['user'], msg=req['log']))
        db.commit()
        return {"ok": True}
    finally: db.close()

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
        return {"ok": True}
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