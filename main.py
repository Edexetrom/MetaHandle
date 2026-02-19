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

# Google Auth & Sheets
from google.oauth2 import service_account
from googleapiclient.discovery import build

# Firebase/Firestore
import firebase_admin
from firebase_admin import credentials, firestore

from dotenv import load_dotenv

# Carga obligatoria de .env para Docker
load_dotenv()

# --- CONFIGURACIÓN DE FIREBASE ---
def init_firebase():
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    if not firebase_admin._apps:
        if creds_b64:
            creds_dict = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
            cred = credentials.Certificate(creds_dict)
        else:
            # Fallback a variables individuales (mismos nombres que tu Docker)
            raw_key = os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n').strip('"').strip("'")
            info = {
                "type": os.environ.get("GOOGLE_TYPE", "service_account"),
                "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
                "private_key_id": os.environ.get("PROJECT_PRIVATE_KEY_ID"),
                "private_key": raw_key,
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
    "120234721717970717", "120234721717960717", "120234721717950717",
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
    days_str = str(days_str).upper().strip()
    if "-" in days_str:
        start, end = days_str.split("-")
        s_idx = DAYS_MAP.get(start.strip(), 0)
        e_idx = DAYS_MAP.get(end.strip(), 6)
        return list(range(s_idx, e_idx + 1))
    else:
        return [DAYS_MAP.get(d.strip(), 0) for d in days_str.split(",") if d.strip() in DAYS_MAP]

# --- MOTOR DE AUTOMATIZACIÓN ---
async def automation_engine():
    while True:
        await asyncio.sleep(120) # 2 minutos
        try:
            state_ref = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("automation").document("state")
            state_doc = state_ref.get()
            if not state_doc.exists or not state_doc.to_dict().get("is_active"):
                continue

            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            
            # Reset diario automático a medianoche
            if now.hour == 0 and now.minute < 3:
                settings_ref = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("adsets")
                for d in settings_ref.stream(): d.reference.update({"is_frozen": False})

            async with httpx.AsyncClient() as client:
                res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                    "fields": "id,status,daily_budget,insights.date_preset(today){spend}",
                    "access_token": ACCESS_TOKEN, "limit": "500"
                })
                meta_data = res.json().get("data", [])
                
                settings_col = db_fs.collection("artifacts").document(app_id).collection("public").document("data").collection("adsets")
                # Por simplicidad, los turnos se asumen definidos o leídos de FS
                curr_h = now.hour + (now.minute / 60)
                curr_day = now.weekday()

                for ad in meta_data:
                    if ad['id'] not in ALLOWED_ADSET_IDS: continue
                    s_doc = settings_col.document(ad['id']).get()
                    if not s_doc.exists: continue
                    s = s_doc.to_dict()
                    if s.get("is_frozen"): continue

                    # Lógica simplificada de turno (configurable desde la UI vía FS)
                    # En producción, podrías leer 'turns' de Firestore
                    in_time = True # Por defecto activo para pruebas si no hay turno

                    spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0))
                    budget = float(ad.get("daily_budget", 0)) / 100
                    limit = float(s.get("limit_perc", 50.0))
                    over_limit = (spend / budget * 100) >= limit if budget > 0 else False

                    should_be_active = in_time and not over_limit
                    is_active = ad['status'] == 'ACTIVE'

                    if should_be_active and not is_active:
                        await client.post(f"{BASE_URL}/{ad['id']}", params={"status": "ACTIVE", "access_token": ACCESS_TOKEN})
                    elif not should_be_active and is_active:
                        await client.post(f"{BASE_URL}/{ad['id']}", params={"status": "PAUSED", "access_token": ACCESS_TOKEN})
        except Exception as e:
            print(f"Engine Error: {e}")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def get_google_creds():
    creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
    if creds_b64:
        creds_json = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        return service_account.Credentials.from_service_account_info(creds_json, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    
    raw_key = os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n').strip('"').strip("'")
    info = {
        "type": "service_account",
        "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
        "private_key_id": os.environ.get("PROJECT_PRIVATE_KEY_ID"),
        "private_key": raw_key,
        "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    return service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])

@app.on_event("startup")
async def startup():
    asyncio.create_task(automation_engine())

@app.get("/auth/auditors")
async def get_auditors():
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    values = res.get('values', [])
    return {"auditors": [row[0] for row in values[1:] if row]}

@app.post("/auth/login")
async def login(req: dict):
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="Auditores!A:B").execute()
    values = res.get('values', [])
    for row in values[1:]:
        if row[0] == req['nombre'] and row[1] == req['password']:
            return {"status": "success", "user": row[0]}
    raise HTTPException(401)

@app.get("/ads/sync")
async def sync_meta():
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
            "fields": "id,name,status,daily_budget,insights.date_preset(today){spend,actions,impressions}",
            "limit": "500", "access_token": ACCESS_TOKEN
        })
        return res.json()