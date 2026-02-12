import React, { useState, useEffect } from 'react';
import { Power, RefreshCw, Clock, Layers, DollarSign, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react';

// URL de la API separada (Asegúrate de que el Backend esté en este dominio)
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
            if (!res.ok) throw new Error("API Offline o error de CORS");
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err.message);
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
            fetchData();
            setSelected([]);
        } catch (err) { setError("Error ejecutando acción manual."); }
    };

    const handleSchedule = async (status) => {
        if (!date || selected.length === 0) return;
        try {
            const res = await fetch(`${API_URL}/ads/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_ids: selected, status, execution_time: date })
            });
            if (res.ok) alert("Programación enviada con éxito.");
        } catch (err) { alert("Error al programar."); }
    };

    const items = mode === 'adsets' ? data.ad_sets : data.ads;

    return (
        <div className="min-h-screen bg-[#020202] text-slate-100 font-sans p-6 md:p-12">
            {/* Header independiente */}
            <header className="flex flex-col md:flex-row justify-between items-center bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] mb-10 shadow-3xl">
                <div className="flex items-center gap-5 mb-6 md:mb-0">
                    <div className="bg-blue-600 p-3 rounded-2xl shadow-2xl shadow-blue-900/40">
                        <Layers className="text-white" size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Ads Manager Enterprise</h1>
                        <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-1">ENDPOINT: {API_URL}</p>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => handleAction('ACTIVE')}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-7 py-3 rounded-2xl text-sm font-black transition-all disabled:opacity-20 shadow-lg shadow-emerald-900/20"
                        disabled={selected.length === 0}
                    >
                        <Power size={18} /> ON
                    </button>
                    <button
                        onClick={() => handleAction('PAUSED')}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 px-7 py-3 rounded-2xl text-sm font-black transition-all disabled:opacity-20 shadow-lg shadow-rose-900/20"
                        disabled={selected.length === 0}
                    >
                        <Power size={18} /> OFF
                    </button>
                    <button onClick={fetchData} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all">
                        <RefreshCw className={loading ? 'animate-spin' : ''} size={22} />
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-10 bg-rose-500/5 border border-rose-500/20 p-5 rounded-3xl flex items-center gap-4 text-rose-400 animate-pulse">
                    <AlertTriangle size={24} />
                    <p className="text-sm font-bold uppercase tracking-wider">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
                {/* Panel Lateral de Programación */}
                <div className="xl:col-span-1 bg-[#0a0a0a] border border-white/5 p-8 rounded-[2rem] h-fit sticky top-12">
                    <h2 className="text-[11px] font-black text-blue-500 uppercase mb-6 tracking-[0.2em] flex items-center gap-2">
                        <Clock size={14} /> Scheduler Pro
                    </h2>
                    <input
                        type="datetime-local"
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-sm mb-6 outline-none focus:border-blue-500 transition-all text-white"
                        onChange={(e) => setDate(e.target.value)}
                    />
                    <div className="flex flex-col gap-3">
                        <button onClick={() => handleSchedule('ACTIVE')} className="w-full bg-white/5 hover:bg-blue-600/20 py-3 rounded-xl border border-white/10 text-xs font-black uppercase transition-all tracking-widest">Programar ON</button>
                        <button onClick={() => handleSchedule('PAUSED')} className="w-full bg-white/5 hover:bg-rose-600/20 py-3 rounded-xl border border-white/10 text-xs font-black uppercase transition-all tracking-widest">Programar OFF</button>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-6 leading-relaxed italic">* Selecciona anuncios en la cuadrícula y luego elige la fecha.</p>
                </div>

                {/* Cuadrícula Principal */}
                <div className="xl:col-span-3">
                    <div className="flex gap-4 mb-8 bg-white/5 p-2 rounded-2xl inline-flex border border-white/5">
                        <button onClick={() => setMode('adsets')} className={`px-10 py-3 rounded-xl text-xs font-black transition-all ${mode === 'adsets' ? 'bg-blue-600 text-white shadow-2xl' : 'text-slate-500 hover:text-white'}`}>GRUPOS</button>
                        <button onClick={() => setMode('ads')} className={`px-10 py-3 rounded-xl text-xs font-black transition-all ${mode === 'ads' ? 'bg-blue-600 text-white shadow-2xl' : 'text-slate-500 hover:text-white'}`}>ANUNCIOS</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelected(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                                className={`group relative bg-[#0a0a0a] border p-8 rounded-[2rem] cursor-pointer transition-all duration-300 ${selected.includes(item.id) ? 'border-blue-500 bg-blue-500/5 scale-[0.98]' : 'border-white/5 hover:border-white/20 hover:bg-white/[0.02]'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-8">
                                    <div className="max-w-[75%]">
                                        <h3 className="font-bold text-base truncate uppercase tracking-tighter text-white" title={item.name}>{item.name}</h3>
                                        <p className="text-[10px] text-slate-600 font-mono mt-2 tracking-widest">ID: {item.id}</p>
                                    </div>
                                    <span className={`text-[10px] px-3 py-1.5 rounded-xl font-black tracking-widest ${item.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                        }`}>
                                        {item.status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-black/40 p-5 rounded-3xl border border-white/5">
                                        <p className="text-[9px] text-slate-600 uppercase font-black mb-2 flex items-center gap-2">
                                            <DollarSign size={10} /> Inversión
                                        </p>
                                        <p className="text-xl font-black text-white">${item.insights?.data?.[0]?.spend || "0"}</p>
                                    </div>
                                    <div className="bg-black/40 p-5 rounded-3xl border border-white/5">
                                        <p className="text-[9px] text-slate-600 uppercase font-black mb-2 flex items-center gap-2">
                                            <TrendingUp size={10} /> Leads
                                        </p>
                                        <p className="text-xl font-black text-blue-500">{item.insights?.data?.[0]?.actions?.[0]?.value || 0}</p>
                                    </div>
                                </div>

                                {selected.includes(item.id) && (
                                    <div className="absolute -top-3 -right-3 bg-blue-600 text-white rounded-full p-1.5 shadow-2xl border-4 border-[#020202] animate-bounce">
                                        <CheckCircle2 size={18} />
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