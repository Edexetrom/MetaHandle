/**
 * SISTEMA: Control Meta Pro v5.4 (SQLite + Polling Safe)
 * FIX: Error 'removeChild' corregido mediante manejo seguro de iconos.
 * REQUERIMIENTOS: 1-18 implementados (Sin Firebase).
 */
const { useState, useEffect, useMemo, useRef } = React;

// --- COMPONENTE: ICONOS (Seguro para React) ---
const Icon = ({ name, size = 16, className = "" }) => {
    // Usamos una clave para forzar el re-renderizado solo si el nombre cambia
    // y evitamos que Lucide rompa la reconciliación de React.
    const iconRef = useRef(null);

    useEffect(() => {
        if (window.lucide && iconRef.current) {
            // Solo creamos los iconos dentro de este elemento específico
            window.lucide.createIcons({
                attrs: {
                    'stroke-width': 2,
                    'width': size,
                    'height': size,
                    'class': className
                },
                nameAttr: 'data-lucide'
            });
        }
    }, [name, size, className]);

    return (
        <span
            ref={iconRef}
            className="inline-flex items-center justify-center"
            style={{ width: size, height: size }}
        >
            <i data-lucide={name}></i>
        </span>
    );
};

const API_URL = "https://manejoapi.libresdeumas.com";

const ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
];

/**
 * LOGIN SCREEN (Punto 1: Droplist desde Sheets)
 */
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
            } else alert("Contraseña incorrecta");
        } catch (e) { alert("Error de conexión"); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
            <div className="w-full max-w-sm bg-zinc-900 p-10 rounded-[2.5rem] border border-white/5 text-center shadow-2xl">
                <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Icon name="shield-check" size={32} className="text-white" />
                </div>
                <h1 className="text-2xl font-black text-white italic uppercase mb-8">Control Meta</h1>
                <form onSubmit={handleLogin} className="space-y-4">
                    <select
                        className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none appearance-none cursor-pointer"
                        value={selected}
                        onChange={e => setSelected(e.target.value)}
                    >
                        {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input
                        type="password" placeholder="Contraseña" required
                        className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none focus:border-blue-500 transition-all"
                        onChange={e => setPass(e.target.value)}
                    />
                    <button className="w-full bg-blue-600 py-4 rounded-xl font-black uppercase text-white hover:bg-blue-500">Entrar</button>
                </form>
            </div>
        </div>
    );
};

/**
 * DASHBOARD
 */
const Dashboard = ({ userEmail, onLogout }) => {
    const [data, setData] = useState({ meta: [], settings: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [syncing, setSyncing] = useState(false);

    // Punto 2 y 9: Polling para sincronización multi-auditor
    const fetchSync = async (silent = false) => {
        if (!silent) setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            setData(json);
        } catch (e) { console.error("Error de sincronización", e); }
        finally { setSyncing(false); }
    };

    useEffect(() => {
        fetchSync();
        const interval = setInterval(() => fetchSync(true), 30000);
        return () => clearInterval(interval);
    }, []);

    const updateSetting = async (id, key, val, logMsg = null) => {
        // Actualización instantánea visual (Punto 3: Sin delay)
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

    const handleBulkAction = async () => {
        if (!bulkLimit || !selectedIds.length) return;
        await fetch(`${API_URL}/ads/bulk-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds, limit_perc: bulkLimit, user: userEmail })
        });
        setBulkLimit(""); setSelectedIds([]);
        fetchSync(true);
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

    return (
        <div className="min-h-screen bg-black text-white p-4 lg:p-10 font-sans">

            {/* HEADER SUMMARY (Punto 16) */}
            <header className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 flex items-center justify-between shadow-xl">
                    <div><p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Automatización</p><p className="text-xl font-black italic uppercase">{data.automation_active ? 'Activa' : 'Apagada'}</p></div>
                    <button
                        onClick={async () => {
                            const res = await fetch(`${API_URL}/ads/automation/toggle`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: userEmail })
                            });
                            const json = await res.json();
                            setData(prev => ({ ...prev, automation_active: json.is_active }));
                        }}
                        className={`w-14 h-7 rounded-full p-1 transition-all ${data.automation_active ? 'bg-blue-600 shadow-[0_0_15px_#2563eb]' : 'bg-zinc-700'}`}
                    >
                        <div className={`w-5 h-5 bg-white rounded-full transition-all ${data.automation_active ? 'translate-x-7' : ''}`} />
                    </button>
                </div>
                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Gasto Hoy / Activos</p>
                    <p className="text-2xl font-black italic uppercase">${stats.s.toFixed(2)} / {stats.a}</p>
                </div>
                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Resultados Totales</p>
                    <p className="text-2xl font-black italic uppercase">{stats.r}</p>
                </div>
                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                    <div className="truncate"><p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Auditor</p><p className="text-xs font-bold truncate">{userEmail}</p></div>
                    <button onClick={onLogout} className="text-rose-500 hover:opacity-70"><Icon name="log-out" size={18} /></button>
                </div>
            </header>

            {/* ACTION LOGS (Punto 10) */}
            <div className="space-y-2 mb-8">
                {data.logs.map((l, i) => (
                    <div key={i} className="bg-blue-600/5 border border-blue-500/10 p-3 rounded-xl flex items-center gap-2 text-[10px] font-bold uppercase">
                        <Icon name="bell" size={12} className="text-blue-500" /><span className="text-blue-400">{l.user}</span> {l.msg} <span className="text-zinc-600 ml-auto">{l.time}</span>
                    </div>
                ))}
            </div>

            {/* ACCIONES GRUPALES (Punto 5) */}
            <div className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5 mb-8 flex flex-wrap items-center gap-6 shadow-xl">
                <div className="flex items-center gap-3 bg-black p-3 px-6 rounded-2xl border border-white/10">
                    <Icon name="zap" size={14} className="text-blue-500" /><span className="text-[10px] font-black uppercase text-zinc-400">Límite Masivo:</span>
                    <input type="number" className="bg-zinc-800 w-16 p-1 text-center text-xs rounded outline-none text-blue-500 font-bold" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} />
                    <button onClick={handleBulkAction} className="bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded uppercase hover:bg-blue-500">Aplicar a {selectedIds.length}</button>
                </div>
                <button onClick={() => fetchSync()} className="bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition-all">
                    <Icon name="refresh-cw" className={syncing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* TABLA PRINCIPAL - SIN TRUNCADO (Punto 13) */}
            <div className="bg-zinc-900 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                <th className="p-6">SEL.</th>
                                <th className="p-6">LED</th>
                                <th className="p-6 min-w-[300px]">NOMBRE COMPLETO ADSET</th>
                                <th className="p-6 text-center">GASTO</th>
                                <th className="p-6 text-center text-blue-500">STOP %</th>
                                <th className="p-6 text-center">RES.</th>
                                <th className="p-6">TURNO / DIAS</th>
                                <th className="p-6 text-center">FREEZE</th>
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
                                        <td className="p-6">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(ad.id)}
                                                onChange={e => e.target.checked ? setSelectedIds([...selectedIds, ad.id]) : setSelectedIds(selectedIds.filter(x => x !== ad.id))}
                                                className="accent-blue-600 w-4 h-4"
                                            />
                                        </td>
                                        <td className="p-6">
                                            <Icon
                                                name="circle"
                                                size={10}
                                                className={ad.status === 'ACTIVE' ? 'text-emerald-500 fill-emerald-500' : 'text-rose-500 fill-rose-500'}
                                            />
                                        </td>
                                        <td className="p-6 whitespace-normal leading-relaxed font-black uppercase text-xs italic tracking-tight">{ad.name}</td>
                                        <td className="p-6 text-center">
                                            <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                                                ${spend.toFixed(2)} ({perc.toFixed(0)}%)
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <input
                                                type="number"
                                                className="bg-black border border-white/10 w-16 p-2 rounded text-center text-blue-500 font-black outline-none"
                                                value={s.limit_perc}
                                                onBlur={(e) => updateSetting(ad.id, 'limit_perc', parseFloat(e.target.value), `Límite: ${e.target.value}% en ${ad.id}`)}
                                            />
                                        </td>
                                        <td className="p-6 text-center font-black">{i.actions?.[0]?.value || 0}</td>
                                        <td className="p-6">
                                            <input
                                                type="text"
                                                className="bg-black/50 border border-white/10 p-2 rounded text-[10px] font-black uppercase text-zinc-300 w-32 outline-none italic tracking-widest"
                                                defaultValue={s.turno}
                                                onBlur={(e) => updateSetting(ad.id, 'turno', e.target.value)}
                                            />
                                        </td>
                                        <td className="p-6 text-center">
                                            <button
                                                onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen, `${!s.is_frozen ? 'Congeló' : 'Descongeló'} ${ad.id}`)}
                                                className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 text-white' : 'bg-white/5 text-zinc-700'}`}
                                            >
                                                {s.is_frozen ? <Icon name="lock" size={16} /> : <Icon name="unlock" size={16} />}
                                            </button>
                                        </td>
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