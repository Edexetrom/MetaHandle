import os
import asyncio
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import httpx
from datetime import datetime
from dotenv import load_dotenv

# Forzamos la carga del archivo .env
load_dotenv()

app = FastAPI(
    title="Meta Ads Control Center",
    version="1.3.0"
)

# Configuración de CORS
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURACIÓN DE META ---
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip().replace('"', '').replace("'", "")
AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip().replace('"', '').replace("'", "")
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

# --- UTILIDADES ---
async def update_meta_status_request(ad_id: str, status: str):
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{BASE_URL}/{ad_id}", 
            params={"status": status, "access_token": ACCESS_TOKEN}
        )
        data = res.json()
        if "error" in data:
            return {"id": ad_id, "success": False, "error": data["error"].get("message")}
        return {"id": ad_id, "success": res.status_code == 200}

# --- ENDPOINTS API ---

@app.get("/")
async def root():
    return {
        "status": "online",
        "endpoints": {
            "interfaz": "/dashboard",
            "documentacion": "/docs",
            "datos_raw": "/ads/dashboard"
        }
    }

@app.get("/ads/dashboard")
async def get_dashboard_data():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=400, detail="Faltan credenciales en el .env")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            adsets_res = await client.get(
                f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", 
                params={
                    "fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}",
                    "access_token": ACCESS_TOKEN
                }
            )
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
    for ad_id in update.ad_ids:
        res = await update_meta_status_request(ad_id, update.status)
        results.append(res)
    return {"results": results, "new_status": update.status}

@app.post("/ads/schedule")
async def schedule_action(action: ScheduleAction, background_tasks: BackgroundTasks):
    target_time = datetime.fromisoformat(action.execution_time)
    delay = (target_time - datetime.now()).total_seconds()
    if delay < 0:
        raise HTTPException(status_code=400, detail="Fecha pasada")

    async def delayed_task():
        await asyncio.sleep(delay)
        for ad_id in action.ad_ids:
            await update_meta_status_request(ad_id, action.status)

    background_tasks.add_task(delayed_task)
    return {"message": "Programado"}

# --- RUTA DEL DASHBOARD (INTERFAZ GRAFICA) ---
@app.get("/dashboard", response_class=HTMLResponse)
async def get_ui():
    return """
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Meta Ads Manager Pro</title>
        <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <script src="https://unpkg.com/babel-standalone@6/babel.min.js"></script>
        <style>
            body { background-color: #020617; color: #f8fafc; }
            .custom-scroll::-webkit-scrollbar { width: 6px; }
            .custom-scroll::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        </style>
    </head>
    <body>
        <div id="root"></div>

        <script type="text/babel">
            const { useState, useEffect } = React;

            const App = () => {
                const [data, setData] = useState({ ad_sets: [], ads: [] });
                const [loading, setLoading] = useState(true);
                const [selectedIds, setSelectedIds] = useState([]);
                const [viewMode, setViewMode] = useState('adsets');
                const [scheduleTime, setScheduleTime] = useState('');

                const fetchData = async () => {
                    setLoading(true);
                    try {
                        const res = await fetch('/ads/dashboard');
                        const json = await res.json();
                        setData(json);
                    } catch (err) { console.error(err); }
                    setLoading(false);
                };

                useEffect(() => { 
                    fetchData();
                    setTimeout(() => lucide.createIcons(), 500);
                }, []);

                const handleToggle = async (status) => {
                    if (selectedIds.length === 0) return;
                    await fetch('/ads/toggle-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ad_ids: selectedIds, status })
                    });
                    fetchData();
                    setSelectedIds([]);
                };

                const handleSchedule = async (status) => {
                    if (!scheduleTime || selectedIds.length === 0) return;
                    await fetch('/ads/schedule', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            ad_ids: selectedIds, 
                            status, 
                            execution_time: new Date(scheduleTime).toISOString() 
                        })
                    });
                    alert("Acción programada correctamente");
                };

                return (
                    <div className="p-4 max-w-7xl mx-auto">
                        <header className="flex flex-wrap justify-between items-center gap-4 mb-8 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl">
                            <div>
                                <h1 className="text-2xl font-black text-blue-500 flex items-center gap-2">
                                    <i data-lucide="layers"></i> META ADS CONTROL
                                </h1>
                                <p className="text-slate-400 text-sm">manejometa.libresdeumas.com</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleToggle('ACTIVE')} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2">
                                    <i data-lucide="power" className="w-4 h-4"></i> ON
                                </button>
                                <button onClick={() => handleToggle('PAUSED')} className="bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2">
                                    <i data-lucide="power" className="w-4 h-4"></i> OFF
                                </button>
                                <button onClick={fetchData} className="bg-slate-800 p-2 rounded-lg hover:bg-slate-700">
                                    <i data-lucide="refresh-cw" className={loading ? "animate-spin" : ""}></i>
                                </button>
                            </div>
                        </header>

                        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8">
                            <h2 className="text-xs uppercase font-black text-slate-500 mb-4 flex items-center gap-2">
                                <i data-lucide="clock" className="w-4 h-4"></i> Programación Masiva
                            </h2>
                            <div className="flex flex-wrap gap-4 items-end">
                                <input 
                                    type="datetime-local" 
                                    className="bg-slate-950 border border-slate-700 p-2 rounded-lg text-white"
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                />
                                <button onClick={() => handleSchedule('ACTIVE')} className="border border-emerald-500/50 text-emerald-500 px-4 py-2 rounded-lg hover:bg-emerald-500/10 transition-all">Prog. Encendido</button>
                                <button onClick={() => handleSchedule('PAUSED')} className="border border-rose-500/50 text-rose-500 px-4 py-2 rounded-lg hover:bg-rose-500/10 transition-all">Prog. Apagado</button>
                            </div>
                        </div>

                        <div className="flex gap-4 mb-6">
                            <button onClick={() => setViewMode('adsets')} className={`px-6 py-2 rounded-full font-bold transition-all ${viewMode === 'adsets' ? 'bg-blue-600' : 'bg-slate-800 text-slate-400'}`}>Grupos</button>
                            <button onClick={() => setViewMode('ads')} className={`px-6 py-2 rounded-full font-bold transition-all ${viewMode === 'ads' ? 'bg-blue-600' : 'bg-slate-800 text-slate-400'}`}>Anuncios</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(viewMode === 'adsets' ? data.ad_sets : data.ads).map(item => (
                                <div 
                                    key={item.id}
                                    onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                                    className={`p-6 rounded-2xl border transition-all cursor-pointer ${selectedIds.includes(item.id) ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="font-bold truncate pr-2" title={item.name}>{item.name}</h3>
                                        <span className={`text-[10px] px-2 py-1 rounded font-black ${item.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase">Gasto</p>
                                            <p className="font-bold">${item.insights?.data?.[0]?.spend || 0}</p>
                                        </div>
                                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase">Resultados</p>
                                            <p className="font-bold">{item.insights?.data?.[0]?.actions?.[0]?.value || 0}</p>
                                        </div>
                                    </div>
                                    {selectedIds.includes(item.id) && (
                                        <div className="absolute top-2 right-2 text-blue-500">
                                            <i data-lucide="check-circle-2"></i>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            };

            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(<App />);
        </script>
    </body>
    </html>
    """