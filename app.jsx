/**
 * SISTEMA: Control Meta Pro v5.5 (SQLite Only)
 * FIX: Modificador de turnos añadido, LEDs de estado fijos, Iconos estables.
 */
const { useState, useEffect, useMemo, useRef } = React;

const Icon = ({ name, size = 16, className = "", spin = false }) => {
    const iconRef = useRef(null);
    useEffect(() => {
        if (window.lucide && iconRef.current) {
            window.lucide.createIcons({
                attrs: { 'stroke-width': 2, 'width': size, 'height': size, 'class': `${className} ${spin ? 'animate-spin' : ''}` },
                nameAttr: 'data-lucide'
            });
        }
    }, [name, size, className, spin]);
    return <span ref={iconRef} className="inline-flex items-center"><i data-lucide={name}></i></span>;
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

const Dashboard = ({ userEmail, onLogout }) => {
    const [data, setData] = useState({ meta: [], settings: {}, turns: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [view, setView] = useState('panel'); // 'panel' o 'turnos'

    const fetchSync = async (silent = false) => {
        if (!silent) setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            setData(json);
        } catch (e) { console.error(e); }
        finally { setSyncing(false); }
    };

    useEffect(() => {
        fetchSync();
        const interval = setInterval(() => fetchSync(true), 30000);
        return () => clearInterval(interval);
    }, []);

    const updateSetting = async (id, key, val, logMsg = null) => {
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

    const updateTurn = async (name, start, end, days) => {
        await fetch(`${API_URL}/turns/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, start, end, days })
        });
        fetchSync(true);
    };

    const sortedData = useMemo(() => {
        return [...data.meta].filter(ad => ALLOWED_IDS.includes(ad.id))
            .sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }, [data.meta]);

    const stats = useMemo(() => sortedData.reduce((acc, ad) => {
        const i = ad.insights?.data?.[0] || {};
        acc.s += parseFloat(i.spend || 0); acc.r += parseInt(i.actions?.[0]?.value || 0);
        if (ad.status === 'ACTIVE') acc.a++; return acc;
    }, { s: 0, r: 0, a: 0 }), [sortedData]);

    return (
        <div className="min-h-screen bg-[#020202] text-white p-4 lg:p-10 font-sans italic tracking-tight">

            {/* HEADER SUMMARY */}
            <header className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5 flex items-center justify-between shadow-xl">
                    <div><p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Automatización</p><p className="text-xl font-black uppercase">{data.automation_active ? 'Activa' : 'Apagada'}</p></div>
                    <button
                        onClick={async () => {
                            const res = await fetch(`${API_URL}/ads/automation/toggle`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: userEmail })
                            });
                            const json = await res.json();
                            setData(prev => ({ ...prev, automation_active: json.is_active }));
                        }}
                        className={`w-14 h-7 rounded-full p-1 transition-all ${data.automation_active ? 'bg-blue-600 shadow-[0_0_15px_#2563eb]' : 'bg-zinc-800'}`}
                    >
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
                    <button onClick={onLogout} className="text-rose-600 hover:text-rose-400"><Icon name="log-out" size={18} /></button>
                </div>
            </header>

            {/* TABS NAVEGACION */}
            <div className="flex gap-4 mb-6">
                <button onClick={() => setView('panel')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'panel' ? 'bg-blue-600' : 'bg-zinc-900 text-zinc-500'}`}>Panel Control</button>
                <button onClick={() => setView('turnos')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'turnos' ? 'bg-blue-600' : 'bg-zinc-900 text-zinc-500'}`}>Gestión Turnos</button>
                <button onClick={() => fetchSync()} className="ml-auto bg-zinc-900 p-3 rounded-xl hover:bg-zinc-800">
                    <Icon name="refresh-cw" spin={syncing} size={16} className="text-blue-500" />
                </button>
            </div>

            {view === 'panel' ? (
                <>
                    <div className="space-y-1 mb-8">
                        {data.logs.map((l, i) => (
                            <div key={i} className="bg-blue-600/5 border border-blue-500/10 p-2 px-4 rounded-xl flex items-center gap-2 text-[9px] font-bold uppercase">
                                <Icon name="bell" size={10} className="text-blue-500" /><span className="text-blue-400">{l.user}</span> {l.msg} <span className="text-zinc-700 ml-auto">{l.time}</span>
                            </div>
                        ))}
                    </div>

                    <div className="bg-zinc-900 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-black text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="p-6">Sel.</th>
                                        <th className="p-6">Led</th>
                                        <th className="p-6">Nombre del Conjunto</th>
                                        <th className="p-6 text-center">Inversión</th>
                                        <th className="p-6 text-center text-blue-500">Stop %</th>
                                        <th className="p-6 text-center">Resultados</th>
                                        <th className="p-6">Tags Turno</th>
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
                                            <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.01] transition-colors ${s.is_frozen ? 'opacity-30' : ''}`}>
                                                <td className="p-6"><input type="checkbox" className="accent-blue-600 w-4 h-4 cursor-pointer" /></td>
                                                <td className="p-6">
                                                    <div className={`w-3 h-3 rounded-full shadow-lg ${active ? 'bg-emerald-500 shadow-emerald-500/40' : 'bg-rose-900/40 border border-rose-500/20'}`}></div>
                                                </td>
                                                <td className="p-6 whitespace-normal leading-relaxed font-black uppercase text-[11px] w-[400px]">{ad.name}</td>
                                                <td className="p-6 text-center">
                                                    <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                                                        ${spend.toFixed(2)} ({perc.toFixed(0)}%)
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <input type="number" className="bg-black border border-white/10 w-16 p-2 rounded-xl text-center text-blue-500 font-black outline-none" value={s.limit_perc} onBlur={(e) => updateSetting(ad.id, 'limit_perc', parseFloat(e.target.value), `Ajustó ppto a ${e.target.value}% en ${ad.id}`)} />
                                                </td>
                                                <td className="p-6 text-center font-black text-white text-base">{i.actions?.[0]?.value || 0}</td>
                                                <td className="p-6">
                                                    <input type="text" className="bg-black/50 border border-white/10 p-2 rounded-xl text-[10px] font-black uppercase text-zinc-400 w-32 outline-none" defaultValue={s.turno} onBlur={(e) => updateSetting(ad.id, 'turno', e.target.value)} />
                                                </td>
                                                <td className="p-6 text-center">
                                                    <button onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen, `${!s.is_frozen ? 'Congeló' : 'Descongeló'} ${ad.id}`)} className={`p-3 rounded-xl ${s.is_frozen ? 'bg-blue-600' : 'bg-zinc-800 text-zinc-600'}`}>
                                                        {s.is_frozen ? <Icon name="lock" size={14} /> : <Icon name="unlock" size={14} />}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in">
                    {Object.entries(data.turns).map(([name, config]) => (
                        <div key={name} className="bg-zinc-900/50 p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="bg-blue-600/10 p-3 rounded-2xl"><Icon name="clock" className="text-blue-500" size={20} /></div>
                                <h2 className="text-lg font-black uppercase tracking-widest">{name}</h2>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="text-[9px] font-black text-zinc-500 uppercase block mb-2 tracking-widest">Hora Inicio (Decimal 24h)</label>
                                    <input type="number" step="0.5" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold" value={config.start} onChange={e => updateTurn(name, e.target.value, config.end, config.days)} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-zinc-500 uppercase block mb-2 tracking-widest">Hora Fin (Decimal 24h)</label>
                                    <input type="number" step="0.5" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold" value={config.end} onChange={e => updateTurn(name, config.start, e.target.value, config.days)} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-zinc-500 uppercase block mb-2 tracking-widest">Días de Actividad</label>
                                    <input type="text" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold uppercase" value={config.days} onChange={e => updateTurn(name, config.start, config.end, e.target.value)} />
                                </div>
                            </div>
                            <p className="mt-6 text-[9px] text-zinc-600 uppercase font-bold tracking-widest leading-relaxed">Nota: Usa .5 para media hora. Ej: 20.5 es las 8:30 PM. Días: L-V o L,M,V.</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: selected, password: pass })
        });
        if (res.ok) {
            const u = await res.json();
            localStorage.setItem('session_user', u.user);
            onLogin(u.user);
        } else alert("Error");
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-black">
            <div className="w-full max-w-sm bg-zinc-900 border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <Icon name="shield-check" size={48} className="text-blue-500 mb-6" />
                <h1 className="text-2xl font-black italic uppercase text-white mb-10">Meta Control</h1>
                <form onSubmit={handleLogin} className="space-y-4">
                    <select className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white outline-none" value={selected} onChange={e => setSelected(e.target.value)}>
                        {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="password" placeholder="Contraseña" required className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-blue-500" onChange={e => setPass(e.target.value)} />
                    <button className="w-full bg-blue-600 py-4 rounded-2xl font-black uppercase text-white shadow-xl">Ingresar</button>
                </form>
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