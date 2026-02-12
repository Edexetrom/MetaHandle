import os
import asyncio
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from datetime import datetime

app = FastAPI(title="Meta Ads Control Center")

# Configuración de CORS para producción
# Añadimos tu dominio específico para permitir las peticiones desde el navegador
origins = [
    "http://localhost:8000",
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
ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "YOUR_TOKEN_HERE")
AD_ACCOUNT_ID = os.getenv("META_AD_ACCOUNT_ID", "act_YOUR_ACCOUNT_ID")
API_VERSION = "v24.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# --- MODELOS DE DATOS ---
class AdStatusUpdate(BaseModel):
    ad_ids: List[str]
    status: str  # 'ACTIVE' or 'PAUSED'

class ScheduleAction(BaseModel):
    ad_ids: List[str]
    status: str
    execution_time: str # ISO format

# --- UTILIDADES ---
async def fetch_from_meta(endpoint: str, params: dict = None):
    if params is None:
        params = {}
    params["access_token"] = ACCESS_TOKEN
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/{endpoint}", params=params)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

async def update_meta_status(ad_id: str, status: str):
    params = {
        "status": status,
        "access_token": ACCESS_TOKEN
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/{ad_id}", params=params)
        return response.status_code == 200

# --- ENDPOINTS ---

@app.get("/ads/dashboard")
async def get_dashboard_data():
    """
    Obtiene anuncios con presupuesto, gasto y resultados.
    """
    ad_sets_data = await fetch_from_meta(f"{AD_ACCOUNT_ID}/adsets", params={
        "fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}"
    })
    
    ads_data = await fetch_from_meta(f"{AD_ACCOUNT_ID}/ads", params={
        "fields": "name,status,adset_id,insights{spend,actions}"
    })

    return {
        "ad_sets": ad_sets_data.get("data", []),
        "ads": ads_data.get("data", [])
    }

@app.post("/ads/toggle-status")
async def toggle_status(update: AdStatusUpdate):
    """
    Enciende o apaga anuncios o grupos de forma masiva.
    """
    results = []
    for ad_id in update.ad_ids:
        success = await update_meta_status(ad_id, update.status)
        results.append({"id": ad_id, "success": success})
    
    return {"results": results, "new_status": update.status}

@app.post("/ads/schedule")
async def schedule_action(action: ScheduleAction, background_tasks: BackgroundTasks):
    """
    Programa una acción de encendido/apagado.
    """
    target_time = datetime.fromisoformat(action.execution_time)
    delay = (target_time - datetime.now()).total_seconds()
    
    if delay < 0:
        raise HTTPException(status_code=400, detail="La fecha debe ser futura")

    async def delayed_task():
        await asyncio.sleep(delay)
        for ad_id in action.ad_ids:
            await update_meta_status(ad_id, action.status)

    background_tasks.add_task(delayed_task)
    return {"message": f"Programado para {action.execution_time}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)