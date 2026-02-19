/**
 * SISTEMA: Control Meta Pro v5.3 (SQLite + Polling + No Truncate)
 * CAMBIO: Solución a CORS y Polling de sincronización multi-auditor.
 */
const { useState, useEffect, useMemo, useRef } = React;

const Icon = ({ name, size = 16, className = "" }) => {
    const iconRef = useRef(null);
    useEffect(() => { if (window.lucide) window.lucide.createIcons(); }, [name]);
    return <i data-lucide={name} className={className} style={{ width: size, height: size }}></i>;
};

// URL de Backend Configurada según tu requerimiento
const API_URL = "https://manejoapi.libresdeumas.com";

const ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
];

const LoginScreen = ({ onLogin }) => {
    const [auditors, setAuditors] = useState([]);
    const [selected, setSelected] = useState("");
    const [pass, setPass] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch(`${API_URL}/auth/auditors`).then(r => r.json()).then(d => {
            setAuditors(d.auditors || []);
            if (d.auditors?.length) setSelected(d.auditors[0]);
        });
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: selected, password: pass })
            });
            if (res.ok) {
                const user = await res.json();
                localStorage.setItem('session_user', user.user);
                onLogin(user.user);
            } else alert("Credenciales incorrectas");
        } catch (e) { alert("Error de conexión con el servidor API"); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-black font-sans">
            <div className="w-full max-w-md bg-zinc-900 border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-blue-500/20">
                    <Icon name="shield-check" size={40} className="text-white" />
                </div>
                <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-10">Control Meta</h1>
                <form onSubmit={handleLogin} className="space-y-6 text-left">
                    <select className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none appearance-none cursor-pointer" value={selected} onChange={e => setSelected(e.target.value)}>
                        {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="password" placeholder="Contraseña" required className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-blue-500 transition-all" onChange={e => setPass(e.target.value)} />
                    <button className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase text-white shadow-xl hover:bg-blue-500 transition-all">Entrar al Sistema</button>
                </form>
            </div>
        </div>
    );
};

const Dashboard = ({ userEmail, onLogout }) => {
    const [data, setData] = useState({ meta: [], settings: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [loading, setLoading] = useState(true);

    const sync = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            if (!res.ok) throw new Error("Sync Fail");
            const json = await res.json();
            setData(json);
        } catch (e) { console.error("Error sincronizando:", e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        sync();
        // Punto 2 y 9: Polling cada 30 segundos para actualizar estado entre usuarios
        const interval = setInterval(() => sync(true), 30000);
        return () => clearInterval(interval);
    }, []);

    const updateSetting = async (id, key, val, logMsg = null) => {
        // Sincronización instantánea local
        setData(prev => ({
            ...prev,
            settings: { ...prev.settings, [id]: { ...prev.settings[id], [key]: val } }
        }));
        await fetch(`${API_URL}/ads/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, [key]: val, user: userEmail, log: logMsg })
        });
    };

    const toggleAuto = async () => {
        const res = await fetch(`${API_URL}/ads/automation/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: userEmail })
        });
        const json = await res.json();
        setData(prev => ({ ...prev, automation_active: json.is_active }));
        sync(true); // Forzar refresco de logs e indicadores
    };

    const handleBulk = async () => {
        if (!bulkLimit || !selectedIds.length) return;
        await fetch(`${API_URL}/ads/bulk-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds, limit_perc: bulkLimit, user: userEmail })
        });
        setBulkLimit(""); setSelectedIds([]);
        sync(true);
    };

    // Punto 12: Ordenar por activos arriba
    const sortedData = useMemo(() => {
        return [...data.meta].filter(ad => ALLOWED_IDS.includes(ad.id))
            .sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }, [data.meta]);

    // Punto 16: Sumatorias superiores
    const stats = useMemo(() => sortedData.reduce((acc, ad) => {
        const i = ad.insights?.data?.[0] || {};
        acc.s += parseFloat(i.spend || 0); acc.r += parseInt(i.actions?.[0]?.value || 0);
        if (ad.status === 'ACTIVE') acc.a++; return acc;
    }, { s: 0, r: 0, a: 0 }), [sortedData]);

    if (loading && !data.meta.length) return <div className="min-h-screen bg-black flex flex-col items-center justify-center font-black text-blue-500 uppercase animate-pulse">
        <Icon name="refresh-cw" className="animate-spin mb-4" size={32} />
        Sincronizando Sistema...
    </div>;

    return (
        <div className="min-h-screen bg-black text-white p-6 lg:p-12 font-sans animate-fade-in">
            <header className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between shadow-2xl">
                    <div><p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Automatización</p><p className="text-xl font-black italic">{data.automation_active ? 'SISTEMA ACTIVO' : 'SISTEMA APAGADO'}</p></div>
                    <button onClick={toggleAuto} className={`w-14 h-7 rounded-full p-1 transition-all ${data.automation_active ? 'bg-blue-600 shadow-[0_0_15px_#2563eb]' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 bg-white rounded-full transition-all ${data.automation_active ? 'translate-x-7' : ''}`} />
                    </button>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Inversión Hoy / Activos</p>
                    <p className="text-2xl font-black italic">${stats.s.toFixed(2)} / {stats.a}</p>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Resultados Totales</p>
                    <p className="text-2xl font-black italic">{stats.r}</p>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between">
                    <div className="truncate"><p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Auditor Conectado</p><p className="text-xs font-bold truncate">{userEmail}</p></div>
                    <button onClick={onLogout} className="text-rose-500 hover:opacity-70 transition-all"><Icon name="log-out" size={20} /></button>
                </div>
            </header>

            {/* Punto 10: Alertas de Auditor */}
            <div className="space-y-2 mb-8">
                {data.logs.map((l, i) => (
                    <div key={i} className="bg-blue-600/5 border border-blue-500/10 p-3 rounded-xl flex items-center gap-2 text-[10px] font-bold uppercase animate-fade-in">
                        <Icon name="bell" size={12} className="text-blue-500" /><span className="text-blue-400">{l.user}</span> {l.msg} <span className="text-zinc-600 ml-auto">{l.time}</span>
                    </div>
                ))}
            </div>

            {/* Punto 5: Selección de Grupos */}
            <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-white/5 mb-8 flex flex-wrap items-center gap-6 shadow-xl">
                <div className="flex items-center gap-3 bg-black p-3 px-6 rounded-2xl border border-white/10">
                    <Icon name="zap" size={14} className="text-blue-500" /><span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Límite Grupal:</span>
                    <input type="number" className="bg-zinc-800 w-16 p-1 text-center text-xs rounded outline-none text-blue-500 font-bold" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} />
                    <button onClick={handleBulk} className="bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded uppercase hover:bg-blue-500 transition-all">Aplicar a {selectedIds.length}</button>
                </div>
                {/* Punto 8: Reset Manual / Descongelar */}
                <button onClick={async () => {
                    await fetch(`${API_URL}/ads/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'all', is_frozen: false, user: userEmail, log: "Realizó descongelado masivo manual" }) });
                    sync(true);
                }} className="text-[10px] font-black uppercase bg-zinc-800 px-6 py-4 rounded-2xl border border-white/5 hover:bg-zinc-700 transition-all tracking-widest">Descongelar Todos</button>
            </div>

            <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                <th className="p-6">SEL.</th><th className="p-6">LED</th><th className="p-6 min-w-[300px]">NOMBRE COMPLETO ADSET</th>
                                <th className="p-6 text-center">PPTO</th><th className="p-6 text-center">GASTO</th>
                                <th className="p-6 text-center text-blue-500">STOP %</th><th className="p-6 text-center">RES.</th>
                                <th className="p-6">TURNO / DIAS</th><th className="p-6 text-center">FREEZE</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {sortedData.map(ad => {
                                const s = data.settings[ad.id] || { turno: "L-V", limit_perc: 50, is_frozen: false };
                                const i = ad.insights?.data?.[0] || {};
                                const budget = parseFloat(ad.daily_budget || 0) / 100;
                                const spend = parseFloat(i.spend || 0);
                                const perc = budget > 0 ? (spend / budget * 100) : 0;
                                return (
                                    <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${s.is_frozen ? 'opacity-40' : ''}`}>
                                        {/* Punto 5: Checkbox Selección */}
                                        <td className="p-6"><input type="checkbox" checked={selectedIds.includes(ad.id)} onChange={e => e.target.checked ? setSelectedIds([...selectedIds, ad.id]) : setSelectedIds(selectedIds.filter(x => x !== ad.id))} className="accent-blue-600 w-4 h-4 cursor-pointer" /></td>
                                        {/* Punto 11: LED de Estado */}
                                        <td className="p-6"><Icon name="circle" size={10} className={ad.status === 'ACTIVE' ? 'text-emerald-500 fill-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-rose-500 fill-rose-500'} /></td>
                                        {/* Punto 13: NO Truncado */}
                                        <td className="p-6 whitespace-normal break-words leading-relaxed font-black uppercase text-[11px] italic tracking-tight">{ad.name}</td>
                                        <td className="p-6 text-center font-bold text-zinc-400">${budget.toFixed(0)}</td>
                                        <td className="p-6 text-center">
                                            <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' : 'text-blue-400 bg-blue-500/10'}`}>
                                                ${spend.toFixed(2)} ({perc.toFixed(0)}%)
                                            </div>
                                        </td>
                                        {/* Punto 6: Cambio Individual */}
                                        <td className="p-6 text-center">
                                            <input type="number" className="bg-black border border-white/10 w-16 p-2 rounded text-center text-blue-500 font-black outline-none" value={s.limit_perc} onBlur={(e) => updateSetting(ad.id, 'limit_perc', parseFloat(e.target.value), `Cambió límite a ${e.target.value}% en AdSet ${ad.id}`)} />
                                        </td>
                                        {/* Punto 15: Resultados */}
                                        <td className="p-6 text-center font-black text-white text-base">{i.actions?.[0]?.value || 0}</td>
                                        {/* Punto 4: Turnos L-V */}
                                        <td className="p-6"><input type="text" className="bg-black/50 border border-white/10 p-2 rounded text-[10px] font-black uppercase text-zinc-300 w-32 outline-none italic tracking-widest" defaultValue={s.turno} onBlur={(e) => updateSetting(ad.id, 'turno', e.target.value)} /></td>
                                        {/* Punto 7: Congelamiento */}
                                        <td className="p-6 text-center"><button onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen, `${!s.is_frozen ? 'Congeló' : 'Descongeló'} AdSet ${ad.id}`)} className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-zinc-700'}`}>{s.is_frozen ? <Icon name="lock" size={16} /> : <Icon name="unlock" size={16} />}</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const App = () => {
    const [session, setSession] = useState(localStorage.getItem('session_user'));
    return !session ? <LoginScreen onLogin={setSession} /> : <Dashboard userEmail={session} onLogout={() => { localStorage.removeItem('session_user'); setSession(null); }} />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);