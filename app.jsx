import React, { useState, useEffect } from 'react';
import {
    Power, RefreshCw, Clock, Layers,
    DollarSign, TrendingUp, CheckCircle2, AlertTriangle
} from 'lucide-react';

// URL de la API separada
const API_URL = "https://manejoapi.libresdeumas.com";

const App = () => {
    const [data, setData] = useState({ ad_sets: [], ads: [] });
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState([]);
    const [mode, setMode] = useState('adsets');
    const [date, setDate] = useState('');
    const [error, setError] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/ads/dashboard`);
            if (!res.ok) throw new Error("Error en la respuesta de la API");
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError("No se pudo conectar con la API. Verifica el dominio y CORS.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleAction = async (status) => {
        if (selected.length === 0) return;
        setLoading(true);
        try {
            await fetch(`${API_URL}/ads/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_ids: selected, status })
            });
            await fetchData();
            setSelected([]);
        } catch (err) { setError("Error al ejecutar acción."); }
    };

    const handleSchedule = async (status) => {
        if (!date || selected.length === 0) return;
        try {
            await fetch(`${API_URL}/ads/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_ids: selected, status, execution_time: date })
            });
            alert("Tarea programada en el servidor.");
        } catch (err) { alert("Error al programar."); }
    };

    const currentItems = mode === 'adsets' ? data.ad_sets : data.ads;

    return (
        <div className="min-h-screen bg-[#050505] text-slate-200 font-sans p-4 md:p-8">
            {/* Navbar Superior */}
            <nav className="flex flex-col md:flex-row justify-between items-center bg-[#0a0a0a] border border-white/10 p-6 rounded-3xl mb-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-4 md:mb-0">
                    <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/40">
                        <Layers className="text-white" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tighter text-white uppercase">Meta Manager Control</h1>
                        <p className="text-[10px] text-blue-500 font-mono">API: {API_URL}</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => handleAction('ACTIVE')}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
                        disabled={selected.length === 0}
                    >
                        <Power size={16} /> ENCENDER
                    </button>
                    <button
                        onClick={() => handleAction('PAUSED')}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
                        disabled={selected.length === 0}
                    >
                        <Power size={16} /> APAGAR
                    </button>
                    <button
                        onClick={fetchData}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                    >
                        <RefreshCw className={loading ? 'animate-spin' : ''} size={20} />
                    </button>
                </div>
            </nav>

            {error && (
                <div className="mb-6 bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex items-center gap-3 text-rose-400">
                    <AlertTriangle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {/* Scheduler */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">
                <div className="lg:col-span-1 bg-[#0a0a0a] border border-white/10 p-6 rounded-3xl">
                    <h2 className="text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest flex items-center gap-2">
                        <Clock size={12} /> Programación Masiva
                    </h2>
                    <input
                        type="datetime-local"
                        className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm mb-4 outline-none focus:border-blue-500 transition-all"
                        onChange={(e) => setDate(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleSchedule('ACTIVE')} className="bg-white/5 hover:bg-blue-600/20 text-xs py-2 rounded-lg border border-white/10 font-bold transition-all uppercase">Encender</button>
                        <button onClick={() => handleSchedule('PAUSED')} className="bg-white/5 hover:bg-rose-600/20 text-xs py-2 rounded-lg border border-white/10 font-bold transition-all uppercase">Apagar</button>
                    </div>
                </div>

                {/* Listado */}
                <div className="lg:col-span-3">
                    <div className="flex gap-4 mb-6 bg-white/5 p-1 rounded-2xl inline-flex border border-white/5">
                        <button
                            onClick={() => setMode('adsets')}
                            className={`px-8 py-2 rounded-xl text-xs font-black transition-all ${mode === 'adsets' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}
                        >
                            GRUPOS (ADSETS)
                        </button>
                        <button
                            onClick={() => setMode('ads')}
                            className={`px-8 py-2 rounded-xl text-xs font-black transition-all ${mode === 'ads' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}
                        >
                            ANUNCIOS (ADS)
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {currentItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelected(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                                className={`group relative bg-[#0a0a0a] border p-6 rounded-3xl cursor-pointer transition-all ${selected.includes(item.id) ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20' : 'border-white/10 hover:border-white/30'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="max-w-[70%]">
                                        <h3 className="font-bold text-sm truncate uppercase tracking-tighter" title={item.name}>{item.name}</h3>
                                        <p className="text-[9px] text-slate-500 font-mono mt-1">ID: {item.id}</p>
                                    </div>
                                    <span className={`text-[9px] px-2 py-1 rounded-lg font-black ${item.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                        }`}>
                                        {item.status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-black/40 p-3 rounded-2xl border border-white/5">
                                        <p className="text-[8px] text-slate-600 uppercase font-black mb-1 flex items-center gap-1">
                                            <DollarSign size={8} /> Gasto
                                        </p>
                                        <p className="text-base font-bold text-white">${item.insights?.data?.[0]?.spend || "0"}</p>
                                    </div>
                                    <div className="bg-black/40 p-3 rounded-2xl border border-white/5">
                                        <p className="text-[8px] text-slate-600 uppercase font-black mb-1 flex items-center gap-1">
                                            <TrendingUp size={8} /> Result.
                                        </p>
                                        <p className="text-base font-bold text-blue-500">{item.insights?.data?.[0]?.actions?.[0]?.value || 0}</p>
                                    </div>
                                </div>

                                {selected.includes(item.id) && (
                                    <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full p-1 shadow-lg border-2 border-[#050505]">
                                        <CheckCircle2 size={16} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;