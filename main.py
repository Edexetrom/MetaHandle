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
    version="1.1.0"
)

# Configuración de CORS para tu dominio en Hostinger
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
    status: str  # 'ACTIVE' o 'PAUSED'

class ScheduleAction(BaseModel):
    ad_ids: List[str]
    status: str
    execution_time: str # Formato ISO: "2024-05-20T15:30:00"

# --- UTILIDADES ---
async def update_meta_status_task(ad_id: str, status: str):
    """Función auxiliar para peticiones POST a Meta"""
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{BASE_URL}/{ad_id}", 
            params={"status": status, "access_token": ACCESS_TOKEN}
        )
        return res.status_code == 200

# --- ENDPOINTS ---

@app.get("/")
async def root():
    return {
        "status": "online",
        "domain": "manejometa.libresdeumas.com",
        "endpoints": ["/docs", "/ads/dashboard"]
    }

@app.get("/ads/dashboard")
async def get_dashboard_data():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=400, detail="Credenciales faltantes en .env")
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Obtener AdSets (Grupos)
            adsets_res = await client.get(
                f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", 
                params={
                    "fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}",
                    "access_token": ACCESS_TOKEN
                }
            )
            
            # Obtener Ads (Anuncios individuales)
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
    """Encendido/Apagado manual inmediato"""
    results = []
    for ad_id in update.ad_ids:
        success = await update_meta_status_task(ad_id, update.status)
        results.append({"id": ad_id, "success": success})
    
    return {"results": results, "new_status": update.status}

@app.post("/ads/schedule")
async def schedule_action(action: ScheduleAction, background_tasks: BackgroundTasks):
    """Programar encendido/apagado para una fecha futura"""
    try:
        target_time = datetime.fromisoformat(action.execution_time)
        now = datetime.now()
        delay = (target_time - now).total_seconds()
        
        if delay < 0:
            raise HTTPException(status_code=400, detail="La fecha de programación debe ser en el futuro")

        async def delayed_execution():
            await asyncio.sleep(delay)
            for ad_id in action.ad_ids:
                await update_meta_status_task(ad_id, action.status)

        background_tasks.add_task(delayed_execution)
        return {
            "message": f"Acción programada exitosamente",
            "execute_at": action.execution_time,
            "status_target": action.status,
            "items_count": len(action.ad_ids)
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use ISO 8601")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)