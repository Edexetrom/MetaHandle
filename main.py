import os
import asyncio
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from datetime import datetime

app = FastAPI(
    title="Meta Ads Control Center",
    description="API para el control de encendido/apagado de anuncios de Meta",
    version="1.0.0"
)

# Configuración de CORS para producción
origins = [
    "http://localhost:3000",
    "http://manejometa.libresdeumas.com",
    "https://manejometa.libresdeumas.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURACIÓN DE META ---
ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = os.getenv("META_AD_ACCOUNT_ID", "")
API_VERSION = "v19.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# --- MODELOS DE DATOS ---
class AdStatusUpdate(BaseModel):
    ad_ids: List[str]
    status: str  # 'ACTIVE' or 'PAUSED'

class ScheduleAction(BaseModel):
    ad_ids: List[str]
    status: str
    execution_time: str 

# --- ENDPOINTS ---

@app.get("/")
async def root():
    """
    Ruta de salud (Health Check)
    """
    return {
        "status": "online",
        "message": "Meta Ads Control API is running",
        "endpoints": {
            "docs": "/docs",
            "dashboard": "/ads/dashboard"
        }
    }

@app.get("/ads/dashboard")
async def get_dashboard_data():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=400, detail="Faltan credenciales de Meta en el archivo .env")
    
    try:
        async with httpx.AsyncClient() as client:
            # Obtener AdSets
            adsets_res = await client.get(
                f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", 
                params={
                    "fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}",
                    "access_token": ACCESS_TOKEN
                }
            )
            
            # Obtener Ads
            ads_res = await client.get(
                f"{BASE_URL}/{AD_ACCOUNT_ID}/ads", 
                params={
                    "fields": "name,status,adset_id,insights{spend,actions}",
                    "access_token": ACCESS_TOKEN
                }
            )

            return {
                "ad_sets": adsets_res.json().get("data", []),
                "ads": ads_res.json().get("data", [])
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ads/toggle-status")
async def toggle_status(update: AdStatusUpdate):
    results = []
    async with httpx.AsyncClient() as client:
        for ad_id in update.ad_ids:
            res = await client.post(
                f"{BASE_URL}/{ad_id}", 
                params={"status": update.status, "access_token": ACCESS_TOKEN}
            )
            results.append({"id": ad_id, "success": res.status_code == 200})
    
    return {"results": results, "new_status": update.status}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)