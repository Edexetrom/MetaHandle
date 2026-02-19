/**
 * SISTEMA: Control Meta Pro v2.21 (Optimizado)
 * AJUSTES: 
 * 1. Optimización de tiempos de respuesta y minimización de renders.
 * 2. Mantenimiento estricto de iconos estáticos (solo gira recarga).
 * 3. Selector de turnos multi-select integrado.
 */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// --- COMPONENTE: ICONOS (Mantenimiento v2.20) ---
const Icon = ({ name, size = 16, className = "", spin = false }) => {
    const iconRef = useRef(null);
    useEffect(() => {
        if (window.lucide && iconRef.current) {
            iconRef.current.innerHTML = `<i data-lucide="${name}"></i>`;
            window.lucide.createIcons({
                attrs: {
                    'stroke-width': 2, 'width': size, 'height': size,
                    'class': `${className} ${spin ? 'animate-spin' : ''}`.trim()
                },
                nameAttr: 'data-lucide',
                root: iconRef.current
            });
        }
    }, [name, size, className, spin]);
    return <span ref={iconRef} className="inline-flex items-center justify-center pointer-events-none" style={{ width: size, height: size }} />;
};

// --- COMPONENTE: SELECTOR DE TURNOS MULTIPLE ---
const TurnSelector = ({ currentTurnos, availableTurns, onUpdate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const activeList = useMemo(() => currentTurnos ? currentTurnos.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [], [currentTurnos]);

    useEffect(() => {
        const handleClickOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleTurno = (name) => {
        const lowerName = name.toLowerCase();
        const newList = activeList.includes(lowerName) ? activeList.filter(t => t !== lowerName) : [...activeList, lowerName];
        onUpdate(newList.join(', '));
    };

    return (
        <div className="relative" ref={containerRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="bg-black/40 border border-white/10 p-2.5 rounded-xl text-[10px] font-black uppercase text-zinc-400 w-36 flex justify-between items-center">
                <span className="truncate">{activeList.length > 0 ? activeList.join(', ') : 'Sin Turnos'}</span>
                <Icon name="ChevronDown" size={10} />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in duration-200">
                    {Object.keys(availableTurns).map(name => (
                        <div key={name} onClick={() => toggleTurno(name)} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer">
                            <div className={`w-3 h-3 rounded-full border ${activeList.includes(name.toLowerCase()) ? 'bg-blue-500 border-blue-400' : 'border-white/20'}`}></div>
                            <span className={`text-[10px] font-bold uppercase ${activeList.includes(name.toLowerCase()) ? 'text-white' : 'text-zinc-500'}`}>{name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const API_URL = "https://manejoapi.libresdeumas.com";
const ALLOWED_IDS = ["120238886501840717", "120238886472900717", "120238886429400717", "120238886420220717", "120238886413960717", "120238886369210717", "120234721717970717", "120234721717960717", "120234721717950717", "120233618279570717", "120233618279540717", "120233611687810717", "120232204774610717", "120232204774590717", "120232204774570717", "120232157515490717", "120232157515480717", "120232157515460717"];

const Dashboard = ({ userEmail, onLogout }) => {
    const [data, setData] = useState({ meta: [], settings: {}, turns: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [view, setView] = useState('panel');

    const fetchSync = useCallback(async (silent = false) => {
        if (!silent) setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            setData(json);
        } catch (e) { console.error("Sync Error", e); }
        finally { if (!silent) setSyncing(false); }
    }, []);

    useEffect(() => {
        fetchSync();
        const interval = setInterval(() => fetchSync(true), 20000);
        return () => clearInterval(interval);
    }, [fetchSync]);

    const toggleMetaStatus = async (id, currentStatus) => {
        const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        // Optimistic UI: Cambio inmediato para el usuario
        setData(prev => ({ ...prev, meta: prev.meta.map(ad => ad.id === id ? { ...ad, status: nextStatus } : ad) }));
        await fetch(`${API_URL}/ads/meta-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: nextStatus, user: userEmail }) });
        fetchSync(true);
    };

    const updateSetting = async (id, key, val, logMsg = null) => {
        setData(prev => ({ ...prev, settings: { ...prev.settings, [id]: { ...prev.settings[id], [key]: val } } }));
        await fetch(`${API_URL}/ads/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, [key]: val, user: userEmail, log: logMsg }) });
    };

    const sortedData = useMemo(() => {
        return [...data.meta].filter(ad => ALLOWED_IDS.includes(ad.id)).sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }, [data.meta]);

    const stats = useMemo(() => sortedData.reduce((acc, ad) => {
        const i = ad.insights?.data?.[0] || {};
        acc.s += parseFloat(i.spend || 0); acc.r += parseInt(i.actions?.[0]?.value || 0);
        if (ad.status === 'ACTIVE') acc.a++; return acc;
    }, { s: 0, r: 0, a: 0 }), [sortedData]);

    return (
        <div className="min-h-screen bg-[#020202] text-white p-4 lg:p-10 font-sans italic tracking-tight text-left">
            <header className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5 flex items-center justify-between shadow-xl">
                    <div><p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Automatización</p><p className="text-xl font-black uppercase">{data.automation_active ? 'Activa' : 'Apagada'}</p></div>
                    <button onClick={async () => {
                        const res = await fetch(`${API_URL}/ads/automation/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: userEmail }) });
                        const json = await res.json();
                        setData(prev => ({ ...prev, automation_active: json.is_active }));
                    }} className={`w-14 h-7 rounded-full p-1 transition-all ${data.automation_active ? 'bg-blue-600 shadow-[0_0_15px_#2563eb]' : 'bg-zinc-800'}`}>
                        <div className={`w-5 h-5 bg-white rounded-full transition-all ${data.automation_active ? 'translate-x-7' : ''}`} />
                    </button>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Gasto Hoy / Activos</p>
                    <p className="text-2xl font-black uppercase tracking-tighter">${stats.s.toFixed(2)} / {stats.a}</p>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Resultados Totales</p>
                    <p className="text-2xl font-black uppercase tracking-tighter">{stats.r}</p>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5 flex items-center justify-between">
                    <div className="truncate"><p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Auditor</p><p className="text-xs font-bold truncate">{userEmail}</p></div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowLogs(!showLogs)} className="relative p-2 bg-white/5 rounded-xl hover:bg-white/10"><Icon name="Bell" size={18} className={data.logs.length > 0 ? "text-blue-500" : "text-zinc-500"} /></button>
                        <button onClick={onLogout} className="p-2 text-rose-600 hover:text-rose-400"><Icon name="LogOut" size={18} /></button>
                    </div>
                </div>
            </header>

            <div className="flex gap-4 mb-6">
                <button onClick={() => setView('panel')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest ${view === 'panel' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Panel Control</button>
                <button onClick={() => setView('turnos')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest ${view === 'turnos' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Gestión Turnos</button>
                <button onClick={() => fetchSync()} className="ml-auto bg-zinc-900 p-3 rounded-xl hover:bg-zinc-800 border border-white/5">
                    <Icon name="RefreshCw" spin={syncing} size={16} className="text-blue-500" />
                </button>
            </div>

            {view === 'panel' ? (
                <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl animate-fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-black text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] border-b border-white/5">
                                    <th className="p-6">Sel.</th>
                                    <th className="p-6">LED / Manual</th>
                                    <th className="p-6">Nombre</th>
                                    <th className="p-6 text-center">Gasto Hoy</th>
                                    <th className="p-6 text-center text-blue-500">Stop %</th>
                                    <th className="p-6 text-center">Resultados</th>
                                    <th className="p-6">Turnos</th>
                                    <th className="p-6 text-center">Freeze</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {sortedData.map(ad => {
                                    const s = data.settings[ad.id] || { turno: "matutino", limit_perc: 50, is_frozen: false };
                                    const i = ad.insights?.data?.[0] || {};
                                    const budget = parseFloat(ad.daily_budget || 0) / 100;
                                    const spend = parseFloat(i.spend || 0);
                                    const perc = budget > 0 ? (spend / budget * 100) : 0;
                                    const active = ad.status === 'ACTIVE';

                                    return (
                                        <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.01] ${s.is_frozen ? 'opacity-30' : ''}`}>
                                            <td className="p-6">
                                                <input type="checkbox" className="accent-blue-600 w-4 h-4 cursor-pointer" checked={selectedIds.includes(ad.id)} onChange={e => e.target.checked ? setSelectedIds([...selectedIds, ad.id]) : setSelectedIds(selectedIds.filter(x => x !== ad.id))} />
                                            </td>
                                            <td className="p-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-3.5 h-3.5 rounded-full transition-all duration-700 ${active ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-rose-900/30 border border-rose-500/10'}`}></div>
                                                    <button onClick={() => toggleMetaStatus(ad.id, ad.status)} className={`px-2 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${active ? 'bg-zinc-800 text-zinc-500 hover:text-rose-500' : 'bg-emerald-600 text-white shadow-lg'}`}>{active ? 'Apagar' : 'Prender'}</button>
                                                </div>
                                            </td>
                                            <td className="p-6 font-black uppercase text-[11px] italic tracking-tight">{ad.name}</td>
                                            <td className="p-6 text-center font-black">
                                                <div className={`px-3 py-1.5 rounded-xl ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' : 'text-blue-400 bg-blue-500/10'}`}>${spend.toFixed(2)} ({perc.toFixed(0)}%)</div>
                                            </td>
                                            <td className="p-6 text-center">
                                                <input type="number" className="bg-black border border-white/10 w-16 p-2 rounded-xl text-center text-blue-500 font-black outline-none focus:border-blue-500" value={s.limit_perc} onBlur={(e) => updateSetting(ad.id, 'limit_perc', parseFloat(e.target.value))} />
                                            </td>
                                            <td className="p-6 text-center font-black text-base">{i.actions?.[0]?.value || 0}</td>
                                            <td className="p-6"><TurnSelector currentTurnos={s.turno} availableTurns={data.turns} onUpdate={(val) => updateSetting(ad.id, 'turno', val)} /></td>
                                            <td className="p-6 text-center">
                                                <button onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen)} className={`p-3 rounded-xl ${s.is_frozen ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-zinc-800 text-zinc-600'}`}><Icon name={s.is_frozen ? "Lock" : "Unlock"} size={14} /></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-fade-in">
                    {Object.entries(data.turns).map(([name, config]) => (
                        <div key={name} className="bg-zinc-900/50 p-10 rounded-[3rem] border border-white/5 shadow-2xl">
                            <div className="flex items-center gap-3 mb-8"><Icon name="Clock" className="text-blue-500" size={24} /><h2 className="text-xl font-black uppercase text-zinc-100">{name}</h2></div>
                            <div className="space-y-6">
                                <div><label className="text-[10px] font-black text-zinc-500 uppercase block mb-3">Inicio (24h)</label><input type="number" step="0.5" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold outline-none focus:border-blue-500" value={config.start} /></div>
                                <div><label className="text-[10px] font-black text-zinc-500 uppercase block mb-3">Fin (24h)</label><input type="number" step="0.5" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold outline-none focus:border-blue-500" value={config.end} /></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Renderizado directo compatible con Babel Standalone
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
function App() {
    const [session, setSession] = useState(localStorage.getItem('session_user'));
    return !session ? <div className="min-h-screen flex items-center justify-center bg-black"><button onClick={() => { localStorage.setItem('session_user', 'Auditor Principal'); window.location.reload(); }} className="bg-blue-600 px-10 py-5 rounded-2xl font-black uppercase text-white shadow-2xl hover:bg-blue-500 transition-all transform active:scale-95">Ingresar al Panel</button></div> : <Dashboard userEmail={session} onLogout={() => { localStorage.removeItem('session_user'); setSession(null); }} />;
}