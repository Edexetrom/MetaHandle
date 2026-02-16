import os
import asyncio
from typing import List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from datetime import datetime
from dotenv import load_dotenv

# Carga de variables de entorno
load_dotenv()

app = FastAPI(title="Meta Ads API Pro", version="2.1.0")

# CONFIGURACIÓN DE CORS
# Importante: Permitir el puerto 8000 que es donde vivirá el Frontend ahora
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://manejometa.libresdeumas.com",
        "https://manejometa.libresdeumas.com",
        "http://manejometa.libresdeumas.com:8000",
        "https://manejometa.libresdeumas.com:8000",
        "http://localhost:8000",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
API_VERSION = "v19.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

class AdStatusUpdate(BaseModel):
    ad_ids: List[str]
    status: str 

class ScheduleAction(BaseModel):
    ad_ids: List[str]
    status: str
    execution_time: str 

async def call_meta(method: str, endpoint: str, params: dict = None):
    if params is None: params = {}
    params["access_token"] = ACCESS_TOKEN
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{BASE_URL}/{endpoint}"
        if method == "GET":
            res = await client.get(url, params=params)
        else:
            res = await client.post(url, params=params)
        return res.json()

@app.get("/health")
async def health():
    return {"status": "ok", "account": AD_ACCOUNT_ID, "timestamp": datetime.now()}

@app.get("/ads/dashboard")
async def get_dashboard():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=500, detail="Faltan credenciales en el archivo .env")
        
    adsets_task = call_meta("GET", f"{AD_ACCOUNT_ID}/adsets", {"fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}"})
    ads_task = call_meta("GET", f"{AD_ACCOUNT_ID}/ads", {"fields": "name,status,adset_id,insights{spend,actions}"})
    
    adsets_data, ads_data = await asyncio.gather(adsets_task, ads_task)
    
    if "error" in adsets_data:
        raise HTTPException(status_code=400, detail=adsets_data["error"].get("message"))

    return {
        "ad_sets": adsets_data.get("data", []),
        "ads": ads_data.get("data", [])
    }

@app.post("/ads/toggle")
async def toggle(update: AdStatusUpdate):
    results = []
    for ad_id in update.ad_ids:
        res = await call_meta("POST", ad_id, {"status": update.status})
        results.append({"id": ad_id, "success": "error" not in res})
    return {"results": results}

@app.post("/ads/schedule")
async def schedule(action: ScheduleAction, background_tasks: BackgroundTasks):
    try:
        target_time = datetime.fromisoformat(action.execution_time.replace("Z", ""))
        delay = (target_time - datetime.now()).total_seconds()
        if delay < 0: raise HTTPException(status_code=400, detail="La fecha debe ser futura")

        async def task():
            await asyncio.sleep(delay)
            for ad_id in action.ad_ids: 
                await call_meta("POST", ad_id, {"status": action.status})
        
        background_tasks.add_task(task)
        return {"message": "Acción programada", "delay_seconds": delay}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))