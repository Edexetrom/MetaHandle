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
    version="1.3.1"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# --- UTILIDADES API ---
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
    return {"status": "online", "dashboard": "/dashboard"}

@app.get("/ads/dashboard")
async def get_dashboard_data():
    if not ACCESS_TOKEN or not AD_ACCOUNT_ID:
        raise HTTPException(status_code=400, detail="Credenciales no configuradas")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Peticiones paralelas para mayor velocidad
            adsets_task = client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/adsets", params={
                "fields": "name,status,daily_budget,lifetime_budget,insights{spend,actions}",
                "access_token": ACCESS_TOKEN
            })
            ads_task = client.get(f"{BASE_URL}/{AD_ACCOUNT_ID}/ads", params={
                "fields": "name,status,adset_id,insights{spend,actions}",
                "access_token": ACCESS_TOKEN
            })
            
            adsets_res, ads_res = await asyncio.gather(adsets_task, ads_task)
            
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
    return {"results": results}

@app.post("/ads/schedule")
async def schedule_action(action: ScheduleAction, background_tasks: BackgroundTasks):
    target_time = datetime.fromisoformat(action.execution_time.replace("Z", ""))
    delay = (target_time - datetime.now()).total_seconds()
    
    if delay < 0:
        raise HTTPException(status_code=400, detail="La fecha debe ser futura")

    async def delayed_task():
        await asyncio.sleep(delay)
        for ad_id in action.ad_ids:
            await update_meta_status_request(ad_id, action.status)

    background_tasks.add_task(delayed_task)
    return {"message": "Programación exitosa"}

# --- INTERFAZ GRAFICA (HTML + REACT CDN) ---
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
            body { background-color: #020617; color: #f8fafc; font-family: sans-serif; }
            .card-selected { border-color: #3b82f6; background-color: rgba(59, 130, 246, 0.1); box-shadow: 0 0 15px rgba(59, 130, 246, 0.2); }
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
                        setData({
                            ad_sets: json.ad_sets || [],
                            ads: json.ads || []
                        });
                    } catch (err) { 
                        console.error("Error cargando datos:", err);
                    } finally {
                        setLoading(false);
                        // Reinicializar iconos de Lucide después de renderizar
                        setTimeout(() => lucide.createIcons(), 100);
                    }
                };

                useEffect(() => { 
                    fetchData();
                }, []);

                const handleToggle = async (status) => {
                    if (selectedIds.length === 0) return;
                    setLoading(true);
                    await fetch('/ads/toggle-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ad_ids: selectedIds, status })
                    });
                    await fetchData();
                    setSelectedIds([]);
                };

                const handleSchedule = async (status) => {
                    if (!scheduleTime || selectedIds.length === 0) {
                        alert("Selecciona items y una fecha válida");
                        return;
                    }
                    await fetch('/ads/schedule', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            ad_ids: selectedIds, 
                            status, 
                            execution_time: scheduleTime
                        })
                    });
                    alert("Acción programada correctamente en el servidor");
                };

                const items = viewMode === 'adsets' ? data.ad_sets : data.ads;

                return (
                    <div className="p-4 md:p-8 max-w-7xl mx-auto">
                        <header className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10 bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
                            <div>
                                <h1 className="text-3xl font-black text-blue-500 flex items-center gap-3">
                                    <i data-lucide="layers"></i> META CONTROL PRO
                                </h1>
                                <p className="text-slate-400 text-sm mt-1">manejometa.libresdeumas.com</p>
                            </div>
                            
                            <div className="flex gap-3">
                                <button onClick={() => handleToggle('ACTIVE')} className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2">
                                    <i data-lucide="power" className="w-4 h-4"></i> ENCENDER
                                </button>
                                <button onClick={() => handleToggle('PAUSED')} className="bg-rose-600 hover:bg-rose-500 px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2">
                                    <i data-lucide="power" className="w-4 h-4"></i> APAGAR
                                </button>
                                <button onClick={fetchData} className="bg-slate-800 p-3 rounded-xl hover:bg-slate-700 transition-all">
                                    <i data-lucide="refresh-cw" className={loading ? "animate-spin" : ""}></i>
                                </button>
                            </div>
                        </header>

                        <section className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 mb-10">
                            <h2 className="text-xs uppercase font-black text-slate-500 mb-4 flex items-center gap-2">
                                <i data-lucide="clock" className="w-4 h-4"></i> Programación de Tareas
                            </h2>
                            <div className="flex flex-wrap gap-4 items-end">
                                <input 
                                    type="datetime-local" 
                                    className="bg-slate-950 border border-slate-700 p-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                />
                                <button onClick={() => handleSchedule('ACTIVE')} className="bg-blue-600/10 text-blue-400 border border-blue-500/30 px-5 py-3 rounded-xl hover:bg-blue-600/20 transition-all font-bold">Prog. On</button>
                                <button onClick={() => handleSchedule('PAUSED')} className="bg-slate-800 text-slate-400 border border-slate-700 px-5 py-3 rounded-xl hover:bg-rose-500/10 hover:text-rose-400 transition-all font-bold">Prog. Off</button>
                            </div>
                        </section>

                        <div className="flex gap-4 mb-8">
                            <button onClick={() => setViewMode('adsets')} className={`px-8 py-3 rounded-full font-black text-sm transition-all ${viewMode === 'adsets' ? 'bg-blue-600 shadow-lg' : 'bg-slate-800 text-slate-500'}`}>GRUPOS</button>
                            <button onClick={() => setViewMode('ads')} className={`px-8 py-3 rounded-full font-black text-sm transition-all ${viewMode === 'ads' ? 'bg-blue-600 shadow-lg' : 'bg-slate-800 text-slate-500'}`}>ANUNCIOS</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {items.length > 0 ? items.map(item => (
                                <div 
                                    key={item.id}
                                    onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                                    className={`relative p-6 rounded-3xl border transition-all cursor-pointer group ${selectedIds.includes(item.id) ? 'card-selected' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="max-w-[70%]">
                                            <h3 className="font-bold text-lg truncate group-hover:text-blue-400 transition-colors" title={item.name}>{item.name}</h3>
                                            <p className="text-[10px] text-slate-500 font-mono mt-1">ID: {item.id}</p>
                                        </div>
                                        <span className={`text-[10px] px-2 py-1 rounded-lg font-black tracking-widest ${item.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50">
                                            <p className="text-[10px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                                                <i data-lucide="dollar-sign" className="w-3 h-3"></i> Gastado
                                            </p>
                                            <p className="text-xl font-bold">${item.insights?.data?.[0]?.spend || "0.00"}</p>
                                        </div>
                                        <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50">
                                            <p className="text-[10px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                                                <i data-lucide="trending-up" className="w-3 h-3"></i> Resultados
                                            </p>
                                            <p className="text-xl font-bold text-blue-400">{item.insights?.data?.[0]?.actions?.find(a => a.action_type === 'results')?.value || 0}</p>
                                        </div>
                                    </div>

                                    {selectedIds.includes(item.id) && (
                                        <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full p-1 shadow-xl">
                                            <i data-lucide="check-circle-2" className="w-5 h-5"></i>
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="col-span-full py-20 text-center bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
                                    <p className="text-slate-500 font-bold italic">No se encontraron datos para mostrar.</p>
                                </div>
                            )}
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