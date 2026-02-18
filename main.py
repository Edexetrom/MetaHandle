import os
import asyncio
import httpx
import base64
import json
import pytz
from datetime import datetime, time
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Google Auth & Sheets
from google.oauth2 import service_account
from googleapiclient.discovery import build

# Firebase/Firestore para sincronización en tiempo real entre auditores
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()

# --- CONFIGURACIÓN DE FIREBASE (Sincronización Real-Time) ---
def init_firebase():
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    if not firebase_admin._apps:
        if creds_b64:
            creds_dict = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
            cred = credentials.Certificate(creds_dict)
        else:
            # Fallback a variables individuales
            info = {
                "type": "service_account",
                "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
                "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n'),
                "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
                "token_uri": "https://oauth2.googleapis.com/token",
            }
            cred = credentials.Certificate(info)
        firebase_admin.initialize_app(cred)
    return firestore.client()

db_fs = init_firebase()
app_id = os.environ.get("APP_ID", "control-meta-pro-v4")

# --- IDs PERMITIDOS ---
ALLOWED_ADSET_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717990717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
]

# --- CONFIGURACIÓN META ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"

# --- UTILIDADES DE TIEMPO ---
DAYS_MAP = {"L": 0, "M": 1, "MI": 2, "J": 3, "V": 4, "S": 5, "D": 6}

def parse_days(days_str: str) -> List[int]:
    """Convierte 'L-V' en [0,1,2,3,4] o 'L, S' en [0, 5]"""
    days = []
    if "-" in days_str:
        start, end = days_str.split("-")
        s_idx = DAYS_MAP.get(start.strip().upper(), 0)
        e_idx = DAYS_MAP.get(end.strip().upper(), 6)
        return list(range(s_idx, e_idx + 1))
    else:
        for d in days_str.split(","):
            idx = DAYS_MAP.get(d.strip().upper())
            if idx is not None: days.append(idx)
    return days

# --- MOTOR DE AUTOMATIZACIÓN (Loop Cada 2 Minutos) ---
async def automation_engine():
    while True:
        await asyncio.sleep(120) 
        try:
            # 1. Leer estado global desde Firestore
            state_ref = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("automation").document("state")
            state_doc = state_ref.get()
            if not state_doc.exists or not state_doc.to_dict().get("is_active"):
                continue

            # 2. Reset diario a medianoche (CDMX)
            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            if now.hour == 0 and now.minute < 3:
                # Reset frozen
                settings_ref = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("adsets")
                docs = settings_ref.stream()
                for d in docs: d.reference.update({"is_frozen": False})

            # 3. Consultar Meta
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                    "fields": "id,status,daily_budget,insights.date_preset(today){spend}",
                    "access_token": ACCESS_TOKEN, "limit": "500"
                })
                meta_data = res.json().get("data", [])
                
                # 4. Procesar Reglas
                settings_col = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("adsets")
                turns_col = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("turns")
                
                turns_dict = {t.id: t.to_dict() for t in turns_col.stream()}
                
                curr_h = now.hour + (now.minute / 60)
                curr_day = now.weekday()

                for ad in meta_data:
                    if ad['id'] not in ALLOWED_ADSET_IDS: continue
                    
                    s_doc = settings_col.document(ad['id']).get()
                    if not s_doc.exists: continue
                    s = s_doc.to_dict()
                    
                    if s.get("is_frozen"): continue

                    # Reglas de Turno
                    assigned_turns = [t.strip().lower() for t in s.get("turno", "").split(",")]
                    in_time = False
                    for t_name in assigned_turns:
                        t_cfg = turns_dict.get(t_name)
                        if t_cfg:
                            active_days = parse_days(t_cfg.get("days", ""))
                            if curr_day in active_days and (t_cfg['start'] <= curr_h < t_cfg['end']):
                                in_time = True; break
                    
                    # Stop Loss
                    spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    limit = s.get("limit_perc", 50.0)
                    over_limit = (spend / budget * 100) >= limit if budget > 0 else False

                    should_be_active = in_time and not over_limit
                    is_active = ad['status'] == 'ACTIVE'

                    if should_be_active and not is_active:
                        await client.post(f"{BASE_URL}/{ad['id']}", params={"status": "ACTIVE", "access_token": ACCESS_TOKEN})
                    elif not should_be_active and is_active:
                        await client.post(f"{BASE_URL}/{ad['id']}", params={"status": "PAUSED", "access_token": ACCESS_TOKEN})

        except Exception as e:
            print(f"Engine Error: {e}")

# --- API ENDPOINTS ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    asyncio.create_task(automation_engine())

@app.get("/auth/auditors")
async def get_auditors():
    """Lee auditores desde la hoja de Google"""
    try:
        creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
        creds_dict = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
        values = res.get('values', [])
        return {"auditors": [row[0] for row in values[1:] if row]}
    except:
        return {"auditors": ["Admin"]}

@app.post("/auth/login")
async def login(req: dict):
    try:
        creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
        creds_dict = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
        values = res.get('values', [])
        for row in values[1:]:
            if row[0] == req['nombre'] and row[1] == req['password']:
                return {"status": "success", "user": row[0]}
        raise HTTPException(401)
    except:
        raise HTTPException(401)

@app.get("/ads/sync")
async def sync_meta():
    """Sincroniza datos de Meta para el Frontend"""
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
            "fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions,impressions}",
            "limit": "500", "access_token": ACCESS_TOKEN
        })
        return res.json()