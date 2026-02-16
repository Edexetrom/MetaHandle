import os
import asyncio
from typing import List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Meta Ads API", version="2.0.2")

# --- CONFIGURACIÓN DE CORS LIMPIA ---
# Usamos exclusivamente tus dominios oficiales
origins = [
    "http://manejometa.libresdeumas.com",
    "https://manejometa.libresdeumas.com",
    "http://manejoapi.libresdeumas.com",
    "https://manejoapi.libresdeumas.com",
    "http://localhost:3000",
    "http://localhost:8000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

async def call_meta_api(method: str, endpoint: str, params: dict = None):
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
async def health_check():
    return {"status": "ok", "timestamp": datetime.now()}

@app.get("/ads/dashboard")
async def get_ads_data():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=500, detail="API no configurada correctamente")
    
    adsets_task = call_meta_api("GET", f"{AD_ACCOUNT_ID}/adsets", {
        "fields": "name,status,daily_budget,insights.date_preset(today){spend,actions}"
    })
    ads_task = call_meta_api("GET", f"{AD_ACCOUNT_ID}/ads", {
        "fields": "name,status,adset_id,insights.date_preset(today){spend,actions}"
    })
    
    adsets_data, ads_data = await asyncio.gather(adsets_task, ads_task)
    
    if "error" in adsets_data:
        raise HTTPException(status_code=400, detail=adsets_data["error"].get("message"))

    return {
        "ad_sets": adsets_data.get("data", []),
        "ads": ads_data.get("data", [])
    }

@app.post("/ads/toggle")
async def toggle_ads(update: AdStatusUpdate):
    results = []
    for ad_id in update.ad_ids:
        res = await call_meta_api("POST", ad_id, {"status": update.status})
        results.append({"id": ad_id, "success": "error" not in res})
    return {"results": results}

@app.post("/ads/schedule")
async def schedule_ads(action: ScheduleAction, background_tasks: BackgroundTasks):
    try:
        target_time = datetime.fromisoformat(action.execution_time.replace("Z", ""))
        delay = (target_time - datetime.now()).total_seconds()
        
        if delay < 0:
            raise HTTPException(status_code=400, detail="La fecha debe ser futura")

        async def execute_task():
            await asyncio.sleep(delay)
            for ad_id in action.ad_ids:
                await call_meta_api("POST", ad_id, {"status": action.status})

        background_tasks.add_task(execute_task)
        return {"message": "Acción programada", "delay_seconds": delay}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")