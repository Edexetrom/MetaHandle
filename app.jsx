import React, { useState, useEffect } from 'react';
import {
    Power,
    Clock,
    RefreshCw,
    Layers,
    DollarSign,
    TrendingUp,
    CheckCircle2
} from 'lucide-react';

/**
 * Nota Senior: 
 * Este archivo representa la UI desacoplada. 
 * En produccion, este codigo se compila y se sirve como estatico.
 */

const App = () => {
    const [data, setData] = useState({ ad_sets: [], ads: [] });
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [viewMode, setViewMode] = useState('adsets'); // 'adsets' o 'ads'
    const [scheduleTime, setScheduleTime] = useState('');

    // Sincronizacion con el Backend de FastAPI
    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await fetch('/ads/dashboard');
            const result = await response.json();
            setData(result);
        } catch (error) {
            console.error("Error al obtener datos de Meta:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Control manual inmediato
    const handleToggle = async (status) => {
        if (selectedIds.length === 0) return;
        try {
            const res = await fetch('/ads/toggle-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_ids: selectedIds, status })
            });
            if (res.ok) {
                fetchData();
                setSelectedIds([]);
            }
        } catch (e) {
            console.error("Error en el cambio de estado:", e);
        }
    };

    // Logica de programacion diferida
    const handleSchedule = async (status) => {
        if (!scheduleTime || selectedIds.length === 0) return;
        try {
            const res = await fetch('/ads/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ad_ids: selectedIds,
                    status,
                    execution_time: new Date(scheduleTime).toISOString()
                })
            });
            if (res.ok) alert("Programacion guardada en el servidor");
        } catch (e) {
            console.error("Error al programar:", e);
        }
    };

    const toggleSelection = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
            {/* Header de Control */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl">
                <div>
                    <h1 className="text-3xl font-black flex items-center gap-3 text-blue-500">
                        <Layers /> META ADS PRO
                    </h1>
                    <p className="text-slate-400 text-sm font-mono mt-1">Status: Conectado a Graph API v19.0</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => handleToggle('ACTIVE')}
                        disabled={selectedIds.length === 0}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20"
                    >
                        <Power size={18} /> ENCENDER
                    </button>
                    <button
                        onClick={() => handleToggle('PAUSED')}
                        disabled={selectedIds.length === 0}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-20 px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-rose-900/20"
                    >
                        <Power size={18} /> APAGAR
                    </button>
                    <button
                        onClick={fetchData}
                        className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            {/* Seccion de Programacion */}
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 mb-8 backdrop-blur-sm">
                <h2 className="text-xs uppercase font-black text-slate-500 mb-4 flex items-center gap-2 tracking-tighter">
                    <Clock size={14} /> Scheduler de Tareas (Selecciona items primero)
                </h2>
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex flex-col gap-2">
                        <input
                            type="datetime-local"
                            className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            onChange={(e) => setScheduleTime(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => handleSchedule('ACTIVE')}
                        className="border border-blue-500/50 text-blue-400 px-4 py-2 rounded-lg hover:bg-blue-500/10 transition-all text-sm font-bold"
                    >
                        Programar On
                    </button>
                    <button
                        onClick={() => handleSchedule('PAUSED')}
                        className="border border-slate-700 text-slate-400 px-4 py-2 rounded-lg hover:bg-rose-500/10 hover:text-rose-400 transition-all text-sm font-bold"
                    >
                        Programar Off
                    </button>
                </div>
            </div>

            {/* Tabs de Navegacion */}
            <div className="flex gap-4 mb-8">
                <button
                    onClick={() => setViewMode('adsets')}
                    className={`px-8 py-2 rounded-full font-black text-sm transition-all ${viewMode === 'adsets' ? 'bg-blue-600 shadow-lg shadow-blue-900/40' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                    GRUPOS (ADSETS)
                </button>
                <button
                    onClick={() => setViewMode('ads')}
                    className={`px-8 py-2 rounded-full font-black text-sm transition-all ${viewMode === 'ads' ? 'bg-blue-600 shadow-lg shadow-blue-900/40' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                    ANUNCIOS (ADS)
                </button>
            </div>

            {/* Grid de Contenido */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(viewMode === 'adsets' ? data.ad_sets : data.ads).map((item) => (
                    <div
                        key={item.id}
                        onClick={() => toggleSelection(item.id)}
                        className={`relative p-6 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.02] ${selectedIds.includes(item.id)
                                ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                                : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="max-w-[75%]">
                                <h3 className="font-bold text-lg truncate group-hover:text-blue-400 transition-colors" title={item.name}>
                                    {item.name}
                                </h3>
                                <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-tighter">ID: {item.id}</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-[10px] font-black tracking-widest ${item.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                }`}>
                                {item.status}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                <p className="text-slate-500 text-[10px] uppercase font-black mb-1 flex items-center gap-1 italic">
                                    <DollarSign size={10} /> Inversión
                                </p>
                                <p className="text-xl font-bold text-white">
                                    ${item.insights?.data?.[0]?.spend || "0.00"}
                                </p>
                            </div>
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                <p className="text-slate-500 text-[10px] uppercase font-black mb-1 flex items-center gap-1 italic">
                                    <TrendingUp size={10} /> Resultados
                                </p>
                                <p className="text-xl font-bold text-blue-400">
                                    {item.insights?.data?.[0]?.actions?.[0]?.value || 0}
                                </p>
                            </div>
                        </div>

                        {selectedIds.includes(item.id) && (
                            <div className="absolute -top-3 -right-3 bg-blue-500 text-white rounded-full p-1 shadow-xl animate-in zoom-in">
                                <CheckCircle2 size={20} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {loading && data.ads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20">
                    <RefreshCw size={40} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-slate-500 animate-pulse font-bold uppercase text-xs tracking-widest">Sincronizando con Meta...</p>
                </div>
            )}
        </div>
    );
};

export default App;