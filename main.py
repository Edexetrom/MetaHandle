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
    version="1.1.1"
)

# Configuración de CORS
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
    status: str 

class ScheduleAction(BaseModel):
    ad_ids: List[str]
    status: str
    execution_time: str 

# --- ENDPOINTS ---

@app.get("/")
async def root():
    return {
        "status": "online",
        "creds_check": {
            "token_present": len(ACCESS_TOKEN) > 0,
            "account_id_present": len(AD_ACCOUNT_ID) > 0,
            "account_id_format_ok": AD_ACCOUNT_ID.startswith("act_")
        }
    }

@app.get("/ads/dashboard")
async def get_dashboard_data():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=400, detail="Faltan credenciales en el .env")
    
    if not AD_ACCOUNT_ID.startswith("act_"):
        raise HTTPException(status_code=400, detail="El AD_ACCOUNT_ID debe empezar con 'act_'")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Obtener AdSets
            adsets_res = await client.get(
                f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", 
                params={
                    "fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}",
                    "access_token": ACCESS_TOKEN
                }
            )
            adsets_json = adsets_res.json()
            
            # Si Meta devuelve error, lo lanzamos
            if "error" in adsets_json:
                raise HTTPException(status_code=400, detail=f"Meta Error (AdSets): {adsets_json['error'].get('message')}")

            # 2. Obtener Ads
            ads_res = await client.get(
                f"{BASE_URL}/{AD_ACCOUNT_ID}/ads", 
                params={
                    "fields": "name,status,adset_id,insights{spend,actions}",
                    "access_token": ACCESS_TOKEN
                }
            )
            ads_json = ads_res.json()

            if "error" in ads_json:
                raise HTTPException(status_code=400, detail=f"Meta Error (Ads): {ads_json['error'].get('message')}")

            return {
                "ad_sets": adsets_json.get("data", []),
                "ads": ads_json.get("data", [])
            }
            
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")

@app.post("/ads/toggle-status")
async def toggle_status(update: AdStatusUpdate):
    results = []
    async with httpx.AsyncClient() as client:
        for ad_id in update.ad_ids:
            res = await client.post(
                f"{BASE_URL}/{ad_id}", 
                params={"status": update.status, "access_token": ACCESS_TOKEN}
            )
            results.append({"id": ad_id, "success": res.status_code == 200, "meta_response": res.json()})
    
    return {"results": results, "new_status": update.status}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)