/**
 * SISTEMA: Control Meta Pro v4.5
 * CARACTERÍSTICAS: Sincronización Real-time, Login Sheets, Multi-turno, Masivos.
 */
const { useState, useEffect, useMemo, useRef } = React;

// --- COMPONENTE: ICONOS ---
const Icon = ({ name, size = 16, className = "" }) => {
    const iconRef = useRef(null);
    useEffect(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, [name]);
    return <i data-lucide={name} className={className} style={{ width: size, height: size }}></i>;
};

const API_URL = window.location.origin.includes('localhost')
    ? "http://localhost:8000"
    : window.location.origin.replace(':80', ':8000');

// --- FIREBASE INIT ---
const firebaseConfig = JSON.parse(window.__firebase_config || '{}');
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const appId = window.__app_id || 'control-meta-pro-v4';

// --- IDs PERMITIDOS ---
const ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
];

/**
 * LOGIN SCREEN
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
        }).catch(e => console.error("Error cargando auditores:", e));
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
                localStorage.setItem('session_user', selected);
                onLogin(selected);
            } else alert("Credenciales incorrectas");
        } catch (e) { alert("Error de conexión con el backend"); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-md bg-zinc-900 border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8">
                    <Icon name="shield-check" size={40} className="text-white" />
                </div>
                <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-10">Control Meta</h2>
                <form onSubmit={handleLogin} className="space-y-6 text-left">
                    <select
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none"
                        value={selected} onChange={e => setSelected(e.target.value)}
                    >
                        {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input
                        type="password" placeholder="Contraseña" required
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-blue-500 transition-all"
                        onChange={e => setPass(e.target.value)}
                    />
                    <button className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase text-white shadow-xl hover:bg-blue-500 transition-all">
                        {loading ? "Sincronizando..." : "Ingresar"}
                    </button>
                </form>
            </div>
        </div>
    );
};

/**
 * DASHBOARD
 */
const Dashboard = ({ userEmail, onLogout }) => {
    const [metaData, setMetaData] = useState([]);
    const [settings, setSettings] = useState({});
    const [autoState, setAutoState] = useState(false);
    const [logs, setLogs] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");

    useEffect(() => {
        auth.signInAnonymously();

        // Listeners Real-time (Sincronización entre auditores)
        const unsubAuto = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('automation').doc('state')
            .onSnapshot(d => d.exists && setAutoState(d.data().is_active));

        const unsubSettings = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('adsets')
            .onSnapshot(s => {
                const d = {}; s.forEach(doc => d[doc.id] = doc.data()); setSettings(d);
            });

        const unsubLogs = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('logs')
            .orderBy('time', 'desc').limit(5)
            .onSnapshot(s => {
                const l = []; s.forEach(doc => l.push(doc.data())); setLogs(l);
            });

        const syncMeta = () => fetch(`${API_URL}/ads/sync`).then(r => r.json()).then(d => setMetaData(d.data || []));
        syncMeta();
        const interval = setInterval(syncMeta, 120000); // 2 min

        return () => { unsubAuto(); unsubSettings(); unsubLogs(); clearInterval(interval); };
    }, []);

    const logAction = async (msg) => {
        await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('logs').add({
            user: userEmail, msg, time: Date.now()
        });
    };

    const updateSetting = async (id, key, val) => {
        await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('adsets').doc(id).set({ [key]: val }, { merge: true });
    };

    const sortedData = useMemo(() => {
        return [...metaData].filter(ad => ALLOWED_IDS.includes(ad.id))
            .sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }, [metaData]);

    const stats = useMemo(() => sortedData.reduce((acc, ad) => {
        const i = ad.insights?.data?.[0] || {};
        acc.s += parseFloat(i.spend || 0); acc.r += parseInt(i.actions?.[0]?.value || 0);
        if (ad.status === 'ACTIVE') acc.a++; return acc;
    }, { s: 0, r: 0, a: 0 }), [sortedData]);

    return (
        <div className="min-h-screen p-6 lg:p-12 animate-fade-in">
            {/* HEADER STATS */}
            <header className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between shadow-2xl">
                    <div><p className="text-[10px] font-black text-blue-500 uppercase">Automatización</p><p className="text-xl font-black italic">{autoState ? 'SISTEMA ACTIVO' : 'SISTEMA APAGADO'}</p></div>
                    <button
                        onClick={async () => {
                            const next = !autoState;
                            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('automation').doc('state').set({ is_active: next });
                            logAction(`${next ? 'Encendió' : 'Apagó'} la automatización`);
                        }}
                        className={`w-14 h-7 rounded-full p-1 transition-all ${autoState ? 'bg-blue-600 shadow-[0_0_15px_#2563eb]' : 'bg-zinc-700'}`}
                    >
                        <div className={`w-5 h-5 bg-white rounded-full transition-all ${autoState ? 'translate-x-7' : ''}`} />
                    </button>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5">
                    <p className="text-[10px] font-black text-zinc-500 uppercase">Gasto Hoy / Activos</p>
                    <p className="text-2xl font-black italic">${stats.s.toFixed(2)} / {stats.a}</p>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5">
                    <p className="text-[10px] font-black text-zinc-500 uppercase">Resultados Totales</p>
                    <p className="text-2xl font-black italic">{stats.r}</p>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between">
                    <div className="truncate"><p className="text-[10px] font-black text-emerald-500 uppercase">Auditor</p><p className="text-xs font-bold truncate">{userEmail}</p></div>
                    <button onClick={onLogout} className="text-rose-500 hover:opacity-70 transition-all"><Icon name="log-out" size={20} /></button>
                </div>
            </header>

            {/* LOGS DE ACTIVIDAD */}
            <div className="space-y-2 mb-8">
                {logs.map((l, i) => (
                    <div key={i} className="bg-blue-600/5 border border-blue-500/10 p-3 rounded-xl flex items-center gap-2 text-[10px] font-bold uppercase">
                        <Icon name="bell" size={12} className="text-blue-500" /><span className="text-blue-400">{l.user}</span> {l.msg}
                    </div>
                ))}
            </div>

            {/* ACCIONES GRUPALES */}
            <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-white/5 mb-8 flex items-center gap-6">
                <div className="flex items-center gap-3 bg-black p-3 px-6 rounded-2xl border border-white/10">
                    <Icon name="zap" size={14} className="text-blue-500" /><span className="text-[10px] font-black uppercase text-zinc-400">Gasto Grupal:</span>
                    <input type="number" className="bg-zinc-800 w-16 p-1 text-center text-xs rounded outline-none text-blue-500 font-bold" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} />
                    <button
                        onClick={async () => {
                            if (!bulkLimit || !selectedIds.length) return;
                            for (const id of selectedIds) await updateSetting(id, 'limit_perc', parseFloat(bulkLimit));
                            logAction(`Límite masivo ${bulkLimit}% aplicado`);
                            setBulkLimit(""); setSelectedIds([]);
                        }}
                        className="bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded uppercase hover:bg-blue-500"
                    >
                        Aplicar a {selectedIds.length}
                    </button>
                </div>
                <button
                    onClick={async () => {
                        const querySnapshot = await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('adsets').get();
                        querySnapshot.forEach(doc => doc.ref.update({ is_frozen: false }));
                        logAction("Realizó reset de congelados");
                    }}
                    className="text-[10px] font-black uppercase bg-zinc-800 px-6 py-4 rounded-2xl border border-white/5 hover:bg-zinc-700 transition-all"
                >
                    Descongelar Todo
                </button>
            </div>

            {/* TABLA PRINCIPAL */}
            <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                <th className="p-6">Sel.</th><th className="p-6">Estado</th><th className="p-6">Nombre del AdSet</th>
                                <th className="p-6 text-center">Ppto</th><th className="p-6 text-center">Gasto</th>
                                <th className="p-6 text-center text-blue-500">Stop %</th><th className="p-6 text-center">Res.</th>
                                <th className="p-6">Turno</th><th className="p-6 text-center">Freeze</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {sortedData.map(ad => {
                                const s = settings[ad.id] || { turno: "matutino", limit_perc: 50, is_frozen: false };
                                const i = ad.insights?.data?.[0] || {};
                                const budget = parseFloat(ad.daily_budget || 0) / 100;
                                const spend = parseFloat(i.spend || 0);
                                const perc = budget > 0 ? (spend / budget * 100) : 0;
                                return (
                                    <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${s.is_frozen ? 'opacity-40' : ''}`}>
                                        <td className="p-6"><input type="checkbox" checked={selectedIds.includes(ad.id)} onChange={e => e.target.checked ? setSelectedIds([...selectedIds, ad.id]) : setSelectedIds(selectedIds.filter(x => x !== ad.id))} className="accent-blue-600" /></td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-2">
                                                <Icon name="circle" size={8} className={ad.status === 'ACTIVE' ? 'text-emerald-500 fill-emerald-500' : 'text-rose-500 fill-rose-500'} />
                                                <span className="font-bold text-[10px] uppercase text-zinc-500">{ad.status}</span>
                                            </div>
                                        </td>
                                        <td className="p-6 whitespace-normal leading-relaxed font-black uppercase text-xs w-[400px]">{ad.name}</td>
                                        <td className="p-6 text-center font-bold text-zinc-400">${budget.toFixed(0)}</td>
                                        <td className="p-6 text-center">
                                            <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' : 'text-blue-400 bg-blue-500/10 border border-blue-500/10'}`}>
                                                ${spend.toFixed(2)} ({perc.toFixed(0)}%)
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <input type="number" className="bg-black border border-white/10 w-16 p-2 rounded text-center text-blue-500 font-black outline-none" value={s.limit_perc} onChange={e => updateSetting(ad.id, 'limit_perc', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="p-6 text-center font-black text-white text-base">{i.actions?.[0]?.value || 0}</td>
                                        <td className="p-6">
                                            <input type="text" className="bg-black/50 border border-white/10 p-2 rounded text-[10px] font-black uppercase text-zinc-300 w-32 outline-none" value={s.turno} onChange={e => updateSetting(ad.id, 'turno', e.target.value)} />
                                        </td>
                                        <td className="p-6 text-center">
                                            <button onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen)} className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 text-white' : 'bg-white/5 text-zinc-700'}`}>
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