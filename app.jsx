import React, { useState, useEffect, useMemo } from 'react';
import {
    ShieldCheck, Cpu, RefreshCw, LogOut, Lock, Unlock,
    Zap, ChevronDown, ChevronUp, Bell, Circle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
    getFirestore, collection, doc, onSnapshot,
    setDoc, updateDoc, getDocs, query, orderBy
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- CONFIGURACIÓN ---
const firebaseConfig = JSON.parse(window.__firebase_config || '{}');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = window.__app_id || 'control-meta-pro-v4';
const API_URL = "http://localhost:8000"; // Cambiar por tu IP de VPS

/**
 * COMPONENTE: LOGIN
 */
const LoginScreen = ({ onLogin }) => {
    const [auditors, setAuditors] = useState([]);
    const [selected, setSelected] = useState("");
    const [pass, setPass] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch(`${API_URL}/auth/auditors`).then(r => r.json()).then(d => {
            setAuditors(d.auditors);
            if (d.auditors.length) setSelected(d.auditors[0]);
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
            localStorage.setItem('session_user', selected);
            onLogin(selected);
        } else alert("Error de acceso");
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md bg-zinc-900 border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-blue-500/20">
                    <ShieldCheck size={40} className="text-white" />
                </div>
                <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-10">Control Meta</h1>
                <form onSubmit={handleLogin} className="space-y-6">
                    <select
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none appearance-none cursor-pointer"
                        value={selected} onChange={e => setSelected(e.target.value)}
                    >
                        {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input
                        type="password" placeholder="Contraseña" required
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-blue-500 transition-all"
                        onChange={e => setPass(e.target.value)}
                    />
                    <button className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-xl transition-all">
                        {loading ? "Sincronizando..." : "Ingresar"}
                    </button>
                </form>
            </div>
        </div>
    );
};

/**
 * COMPONENTE: DASHBOARD PRINCIPAL
 */
const Dashboard = ({ userEmail, onLogout }) => {
    const [metaData, setMetaData] = useState([]);
    const [settings, setSettings] = useState({});
    const [autoState, setAutoState] = useState(false);
    const [turns, setTurns] = useState({});
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");

    // Firebase Real-time Listeners
    useEffect(() => {
        const unsubAuto = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'automation', 'state'), d => {
            if (d.exists()) setAutoState(d.data().is_active);
        });

        const unsubSettings = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'adsets'), s => {
            const data = {};
            s.forEach(doc => data[doc.id] = doc.data());
            setSettings(data);
        });

        const unsubTurns = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'turns'), s => {
            const data = {};
            s.forEach(doc => data[doc.id] = doc.data());
            setTurns(data);
        });

        const unsubLogs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), s => {
            const l = [];
            s.forEach(doc => l.push(doc.data()));
            setLogs(l.sort((a, b) => b.time - a.time).slice(0, 5));
        });

        // Fetch Meta Inicial
        fetch(`${API_URL}/ads/sync`).then(r => r.json()).then(d => {
            setMetaData(d.data || []);
            setLoading(false);
        });

        return () => { unsubAuto(); unsubSettings(); unsubTurns(); unsubLogs(); };
    }, []);

    // Lógica de Registro de Acciones (Logs)
    const logAction = async (msg) => {
        const logRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'));
        await setDoc(logRef, {
            user: userEmail,
            msg: msg,
            time: Date.now()
        });
    };

    // Acciones
    const toggleAuto = async () => {
        const next = !autoState;
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'automation', 'state');
        await setDoc(ref, { is_active: next });
        logAction(`${next ? 'Encendió' : 'Apagó'} la automatización maestra`);
    };

    const updateAdSet = async (id, key, val) => {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'adsets', id);
        await setDoc(ref, { [key]: val }, { merge: true });
        if (key === 'is_frozen') logAction(`${val ? 'Congeló' : 'Descongeló'} AdSet ${id}`);
    };

    const handleBulkLimit = async () => {
        if (!bulkLimit || !selectedIds.length) return;
        for (const id of selectedIds) {
            await updateAdSet(id, 'limit_perc', parseFloat(bulkLimit));
        }
        logAction(`Cambió límite masivo a ${bulkLimit}% para ${selectedIds.length} conjuntos`);
        setBulkLimit("");
        setSelectedIds([]);
    };

    // Procesamiento de Datos
    const sortedData = useMemo(() => {
        return [...metaData]
            .filter(ad => window.__allowed_ids.includes(ad.id))
            .sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }, [metaData]);

    const totals = useMemo(() => {
        return sortedData.reduce((acc, ad) => {
            const ins = ad.insights?.data?.[0] || {};
            acc.spend += parseFloat(ins.spend || 0);
            acc.res += parseInt(ins.actions?.[0]?.value || 0);
            if (ad.status === 'ACTIVE') acc.active++;
            return acc;
        }, { spend: 0, res: 0, active: 0 });
    }, [sortedData]);

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-blue-500 animate-pulse font-black uppercase tracking-widest">Sincronizando Sistema...</div>;

    return (
        <div className="min-h-screen bg-[#020202] text-white p-4 lg:p-12 font-sans overflow-x-hidden">

            {/* HEADER: RESUMEN */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div className="bg-zinc-900 border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between shadow-2xl overflow-hidden relative group">
                    <div className="relative z-10">
                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <Cpu size={12} /> Automatización
                        </h3>
                        <p className="text-xl font-black uppercase italic">{autoState ? "Activa" : "Apagada"}</p>
                    </div>
                    <button
                        onClick={toggleAuto}
                        className={`w-16 h-8 rounded-full p-1 transition-all relative z-10 ${autoState ? 'bg-blue-600' : 'bg-white/10'}`}
                    >
                        <div className={`w-6 h-6 bg-white rounded-full transition-all duration-300 ${autoState ? 'translate-x-8' : 'translate-x-0'}`} />
                    </button>
                    <div className={`absolute inset-0 opacity-10 transition-opacity ${autoState ? 'bg-blue-600' : ''}`} />
                </div>

                <div className="bg-zinc-900 border border-white/5 p-8 rounded-[2.5rem] shadow-xl">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Gasto Total Hoy</p>
                    <p className="text-2xl font-black text-white italic">${totals.spend.toFixed(2)}</p>
                </div>

                <div className="bg-zinc-900 border border-white/5 p-8 rounded-[2.5rem] shadow-xl">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Resultados</p>
                    <p className="text-2xl font-black text-white italic">{totals.res}</p>
                </div>

                <div className="bg-zinc-900 border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between shadow-xl">
                    <div>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 truncate max-w-[120px]">Auditor: {userEmail}</p>
                        <button onClick={onLogout} className="text-[9px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest flex items-center gap-1 transition-all">
                            <LogOut size={10} /> Cerrar Sesión
                        </button>
                    </div>
                    <button onClick={() => window.location.reload()} className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {/* ALERTAS EN TIEMPO REAL */}
            <div className="mb-8 space-y-2">
                {logs.map((log, i) => (
                    <div key={i} className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 p-3 rounded-2xl animate-in slide-in-from-top-4">
                        <Bell size={12} className="text-blue-500" />
                        <p className="text-[10px] font-bold uppercase tracking-wide">
                            <span className="text-blue-400">{log.user}</span> {log.msg}
                            <span className="text-zinc-600 ml-2 font-mono">{new Date(log.time).toLocaleTimeString()}</span>
                        </p>
                    </div>
                ))}
            </div>

            {/* PANEL DE ACCIONES MASIVAS */}
            <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-[2rem] mb-10 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2 bg-black p-3 px-6 rounded-2xl border border-white/10">
                    <Zap size={14} className="text-blue-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Acción Grupal:</span>
                    <input
                        type="number" placeholder="Límite %"
                        className="bg-zinc-800 border-none w-16 p-1 text-center text-xs rounded-lg outline-none text-blue-500 font-bold"
                        value={bulkLimit} onChange={e => setBulkLimit(e.target.value)}
                    />
                    <button
                        onClick={handleBulkStopLoss}
                        className="bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded-lg uppercase tracking-widest hover:bg-blue-500 transition-all"
                    >
                        Aplicar a {selectedIds.length}
                    </button>
                </div>
                <button
                    onClick={() => { setSelectedIds([]); handleResetFrozen(); }}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-6 py-4 rounded-2xl border border-white/5 transition-all text-[10px] font-black uppercase tracking-widest"
                >
                    <Unlock size={14} /> Reset Nocturno (Manual)
                </button>
            </div>

            {/* TABLA: ADSETS */}
            <div className="bg-zinc-900 border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden mb-20">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="p-6">Sel.</th>
                                <th className="p-6">Estado</th>
                                <th className="p-6 min-w-[350px]">Nombre del AdSet</th>
                                <th className="p-6 text-center">Ppto</th>
                                <th className="p-6 text-center">Gasto Hoy</th>
                                <th className="p-6 text-center text-blue-500">Stop-Loss %</th>
                                <th className="p-6 text-center">Res.</th>
                                <th className="p-6">Turno</th>
                                <th className="p-6 text-center">Control</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {sortedData.map(ad => {
                                const s = settings[ad.id] || { turno: "matutino", limit_perc: 50.0, is_frozen: false };
                                const ins = ad.insights?.data?.[0] || {};
                                const budget = parseFloat(ad.daily_budget || 0) / 100;
                                const spend = parseFloat(ins.spend || 0);
                                const perc = budget > 0 ? (spend / budget * 100) : 0;
                                const isOver = perc >= s.limit_perc;

                                return (
                                    <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-all group ${s.is_frozen ? 'opacity-60' : ''}`}>
                                        <td className="p-6">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(ad.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds([...selectedIds, ad.id]);
                                                    else setSelectedIds(selectedIds.filter(id => id !== ad.id));
                                                }}
                                                className="w-4 h-4 accent-blue-600"
                                            />
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-2">
                                                <Circle size={8} fill={ad.status === 'ACTIVE' ? '#10b981' : '#f43f5e'} className={ad.status === 'ACTIVE' ? 'text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'text-rose-500'} />
                                                <span className="font-bold text-[10px] uppercase text-zinc-500">{ad.status}</span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <p className="font-black text-white uppercase leading-relaxed text-sm break-words">{ad.name}</p>
                                            <p className="text-[9px] text-zinc-600 font-mono mt-1 italic">ID: {ad.id}</p>
                                        </td>
                                        <td className="p-6 text-center font-bold text-zinc-400">
                                            ${budget.toFixed(0)}
                                        </td>
                                        <td className="p-6 text-center">
                                            <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${isOver ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-blue-500/10 text-blue-400'}`}>
                                                ${spend.toFixed(2)} <span className="text-[9px] opacity-60 ml-1">({perc.toFixed(0)}%)</span>
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <input
                                                type="number"
                                                className="bg-black border border-white/10 w-16 p-2 rounded-lg text-center text-blue-500 font-black outline-none focus:border-blue-500 transition-all"
                                                value={s.limit_perc}
                                                onChange={e => updateAdSet(ad.id, 'limit_perc', parseFloat(e.target.value))}
                                            />
                                        </td>
                                        <td className="p-6 text-center font-black text-white text-base">
                                            {ins.actions?.[0]?.value || 0}
                                        </td>
                                        <td className="p-6">
                                            <input
                                                type="text"
                                                className="bg-black/50 border border-white/10 p-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-300 w-32 outline-none"
                                                value={s.turno}
                                                onChange={e => updateAdSet(ad.id, 'turno', e.target.value)}
                                            />
                                        </td>
                                        <td className="p-6 text-center">
                                            <button
                                                onClick={() => updateAdSet(ad.id, 'is_frozen', !s.is_frozen)}
                                                className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-zinc-700 hover:text-white'}`}
                                            >
                                                {s.is_frozen ? <Lock size={16} /> : <Unlock size={16} />}
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

// --- APP ENTRY ---
const App = () => {
    const [session, setSession] = useState(localStorage.getItem('session_user'));

    useEffect(() => {
        // Definimos IDs Permitidos Globalmente para el filtro
        window.__allowed_ids = [
            "120238886501840717", "120238886472900717", "120238886429400717",
            "120238886420220717", "120238886413960717", "120238886369210717",
            "120234721717970717", "120234721717960717", "120234721717990717",
            "120233618279570717", "120233618279540717", "120233611687810717",
            "120232204774610717", "120232204774590717", "120232204774570717",
            "120232157515490717", "120232157515480717", "120232157515460717"
        ];

        signInAnonymously(auth);
    }, []);

    if (!session) return <LoginScreen onLogin={setSession} />;
    return <Dashboard userEmail={session} onLogout={() => { localStorage.removeItem('session_user'); setSession(null); }} />;
};

export default App;