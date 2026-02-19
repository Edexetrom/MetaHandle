/**
 * SISTEMA: Control Meta Pro v2.20 (Punto de Retorno)
 * DINAMISMO: Solo el icono de recarga gira.
 * FUNCIONES: Control manual de Meta (Encendido/Apagado por AdSet) habilitado.
 */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// --- COMPONENTE: ICONOS (Manejo Seguro de Animación) ---
const Icon = ({ name, size = 16, className = "", spin = false }) => {
    const iconRef = useRef(null);

    useEffect(() => {
        if (window.lucide && iconRef.current) {
            // Limpiamos contenido para evitar duplicados en el DOM
            iconRef.current.innerHTML = `<i data-lucide="${name}"></i>`;
            window.lucide.createIcons({
                attrs: {
                    'stroke-width': 2,
                    'width': size,
                    'height': size,
                    'class': `${className} ${spin ? 'animate-spin' : ''}`.trim()
                }
            });
        }
    }, [name, size, className, spin]);

    return (
        <span
            ref={iconRef}
            className="inline-flex items-center justify-center pointer-events-none"
            style={{ width: size, height: size }}
        />
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

const Dashboard = ({ userEmail, onLogout }) => {
    const [data, setData] = useState({ meta: [], settings: {}, turns: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [view, setView] = useState('panel');

    // Sincronización de datos
    const fetchSync = useCallback(async (silent = false) => {
        if (!silent) setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            setData(json);
        } catch (e) { console.error("Error de sincronización", e); }
        finally { if (!silent) setSyncing(false); }
    }, []);

    useEffect(() => {
        fetchSync();
        const interval = setInterval(() => fetchSync(true), 25000);
        return () => clearInterval(interval);
    }, [fetchSync]);

    // AJUSTE: Control Manual de Estado en Meta
    const toggleMetaStatus = async (id, currentStatus) => {
        const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        // Respuesta inmediata visual
        setData(prev => ({
            ...prev,
            meta: prev.meta.map(ad => ad.id === id ? { ...ad, status: nextStatus } : ad)
        }));

        await fetch(`${API_URL}/ads/meta-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: nextStatus, user: userEmail })
        });
        fetchSync(true);
    };

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

    const handleBulkAction = async () => {
        if (!bulkLimit || !selectedIds.length) return;
        setSyncing(true);
        await fetch(`${API_URL}/ads/bulk-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds, limit_perc: bulkLimit, user: userEmail })
        });
        setBulkLimit(""); setSelectedIds([]);
        await fetchSync(true);
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

            {/* HEADER STATISTICS */}
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
                    <div className="flex gap-2">
                        <button onClick={() => setShowLogs(!showLogs)} className="relative p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                            <Icon name="bell" size={18} className={data.logs.length > 0 ? "text-blue-500" : "text-zinc-500"} />
                            {data.logs.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>}
                        </button>
                        {/* ICONO SALIR: Estático */}
                        <button onClick={onLogout} className="p-2 text-rose-600 hover:text-rose-400"><Icon name="log-out" size={18} /></button>
                    </div>
                </div>
            </header>

            {/* PANEL DE LOGS */}
            {showLogs && (
                <div className="fixed inset-0 z-50 flex items-start justify-end p-10 pointer-events-none">
                    <div className="w-80 bg-zinc-900 border border-white/10 rounded-[2rem] shadow-2xl p-6 pointer-events-auto animate-fade-in">
                        <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-500">Notificaciones</h3>
                            <button onClick={() => setShowLogs(false)}><Icon name="x" size={14} /></button>
                        </div>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {data.logs.map((l, i) => (
                                <div key={i} className="bg-black/40 p-3 rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-bold uppercase text-blue-400 mb-1">{l.user} <span className="text-zinc-600 float-right">{l.time}</span></p>
                                    <p className="text-[10px] uppercase text-zinc-300 tracking-tight leading-tight">{l.msg}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* NAVEGACIÓN */}
            <div className="flex gap-4 mb-6">
                <button onClick={() => setView('panel')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'panel' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Panel Control</button>
                <button onClick={() => setView('turnos')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'turnos' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Gestión Turnos</button>

                {/* ICONO REFRESH: Único con spin dinámico */}
                <button onClick={() => fetchSync()} className="ml-auto bg-zinc-900 p-3 rounded-xl hover:bg-zinc-800 transition-all border border-white/5">
                    <Icon name="refresh-cw" spin={syncing} size={16} className="text-blue-500" />
                </button>
            </div>

            {view === 'panel' ? (
                <>
                    {/* ACCIONES GRUPALES */}
                    <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-white/5 mb-8 flex flex-wrap items-center gap-6 shadow-xl animate-fade-in">
                        <div className="flex items-center gap-3 bg-black p-3 px-6 rounded-2xl border border-white/10">
                            <Icon name="zap" size={14} className="text-blue-500" /><span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Límite Masivo:</span>
                            <input type="number" className="bg-zinc-800 w-16 p-1 text-center text-xs rounded outline-none text-blue-500 font-bold" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} />
                            <button onClick={handleBulkAction} className="bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded uppercase hover:bg-blue-500 transition-all">Aplicar a {selectedIds.length}</button>
                        </div>
                        <button onClick={async () => {
                            await fetch(`${API_URL}/ads/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'all', is_frozen: false, user: userEmail, log: "Descongeló todos" }) });
                            fetchSync(true);
                        }} className="text-[10px] font-black uppercase bg-zinc-800 px-6 py-4 rounded-2xl border border-white/5 hover:bg-zinc-700 transition-all tracking-widest">Descongelar Todos</button>
                    </div>

                    {/* TABLA PRINCIPAL */}
                    <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-black text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="p-6">Sel.</th>
                                        <th className="p-6">LED / Manual</th>
                                        <th className="p-6 min-w-[350px]">Nombre Completo del AdSet</th>
                                        <th className="p-6 text-center">Inversión</th>
                                        <th className="p-6 text-center text-blue-500">Stop %</th>
                                        <th className="p-6 text-center">Resultados</th>
                                        <th className="p-6">Turno</th>
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
                                                <td className="p-6">
                                                    <input
                                                        type="checkbox"
                                                        className="accent-blue-600 w-4 h-4 cursor-pointer"
                                                        checked={selectedIds.includes(ad.id)}
                                                        onChange={e => e.target.checked ? setSelectedIds([...selectedIds, ad.id]) : setSelectedIds(selectedIds.filter(x => x !== ad.id))}
                                                    />
                                                </td>
                                                <td className="p-6">
                                                    {/* LED + BOTÓN DE ENCENDIDO/APAGADO MANUAL */}
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-3 h-3 rounded-full transition-all duration-500 ${active ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-rose-900/30 border border-rose-500/10'}`}></div>
                                                        <button
                                                            onClick={() => toggleMetaStatus(ad.id, ad.status)}
                                                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all transform active:scale-95 ${active ? 'bg-zinc-800 text-zinc-500 hover:text-rose-500' : 'bg-emerald-600 text-white shadow-lg'}`}
                                                        >
                                                            {active ? 'Apagar' : 'Encender'}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="p-6 whitespace-normal leading-relaxed font-black uppercase text-[11px] italic tracking-tight">{ad.name}</td>
                                                <td className="p-6 text-center">
                                                    <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' : 'text-blue-400 bg-blue-500/10'}`}>
                                                        ${spend.toFixed(2)} ({perc.toFixed(0)}%)
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <input type="number" className="bg-black border border-white/10 w-16 p-2 rounded-xl text-center text-blue-500 font-black outline-none" value={s.limit_perc} onBlur={(e) => updateSetting(ad.id, 'limit_perc', parseFloat(e.target.value), `PPTO: ${e.target.value}% en ${ad.id}`)} />
                                                </td>
                                                <td className="p-6 text-center font-black text-white text-base">{i.actions?.[0]?.value || 0}</td>
                                                <td className="p-6">
                                                    <input type="text" className="bg-black/50 border border-white/10 p-2 rounded-xl text-[10px] font-black uppercase text-zinc-400 w-32 outline-none" defaultValue={s.turno} onBlur={(e) => updateSetting(ad.id, 'turno', e.target.value)} />
                                                </td>
                                                <td className="p-6 text-center">
                                                    <button onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen, `${!s.is_frozen ? 'Congeló' : 'Descongeló'} ${ad.id}`)} className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 shadow-lg' : 'bg-zinc-800 text-zinc-600'}`}>
                                                        <Icon name={s.is_frozen ? "lock" : "unlock"} size={14} />
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
                /* GESTIÓN DE TURNOS */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-fade-in">
                    {Object.keys(data.turns).length > 0 ? Object.entries(data.turns).map(([name, config]) => (
                        <div key={name} className="bg-zinc-900/50 p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="bg-blue-600/10 p-3 rounded-2xl"><Icon name="clock" className="text-blue-500" size={20} /></div>
                                <h2 className="text-lg font-black uppercase tracking-widest">{name}</h2>
                            </div>
                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="text-[9px] font-black text-zinc-500 uppercase block mb-2 tracking-widest">Hora Inicio (Decimal 24h)</label>
                                    <input type="number" step="0.5" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold outline-none" value={config.start} onChange={e => updateTurn(name, e.target.value, config.end, config.days)} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-zinc-500 uppercase block mb-2 tracking-widest">Hora Fin (Decimal 24h)</label>
                                    <input type="number" step="0.5" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold outline-none" value={config.end} onChange={e => updateTurn(name, config.start, e.target.value, config.days)} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-zinc-500 uppercase block mb-2 tracking-widest">Días Semanales</label>
                                    <input type="text" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold uppercase outline-none" value={config.days} onChange={e => updateTurn(name, config.start, config.end, e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )) : <p className="text-zinc-500 uppercase font-black italic text-center w-full">Configurando turnos...</p>}
                </div>
            )}
        </div>
    );
};

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
        }).catch(e => console.error("Error auditores", e));
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
        } catch (e) { alert("Error de conexión"); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 italic tracking-tight font-sans">
            <div className="w-full max-w-sm bg-zinc-900 p-12 rounded-[3.5rem] border border-white/5 text-center shadow-2xl">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-lg shadow-blue-500/20">
                    <Icon name="shield-check" size={40} className="text-white" />
                </div>
                <h1 className="text-2xl font-black italic uppercase text-white mb-10">Meta Control</h1>
                <form onSubmit={handleLogin} className="space-y-6 text-left">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase ml-2">Seleccionar Auditor</label>
                        <select className="w-full bg-black border border-white/10 rounded-2xl p-5 text-white outline-none appearance-none cursor-pointer" value={selected} onChange={e => setSelected(e.target.value)}>
                            {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase ml-2">Contraseña</label>
                        <input type="password" placeholder="••••••••" required className="w-full bg-black border border-white/10 rounded-2xl p-5 text-white outline-none focus:border-blue-600 transition-all" onChange={e => setPass(e.target.value)} />
                    </div>
                    <button className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase text-white shadow-xl hover:bg-blue-500 transition-all transform active:scale-[0.98]">
                        {loading ? "Iniciando..." : "Ingresar"}
                    </button>
                </form>
            </div>
        </div>
    );
};

// Componente Raíz
const App = () => {
    const [session, setSession] = useState(localStorage.getItem('session_user'));
    return !session ? <LoginScreen onLogin={setSession} /> : <Dashboard userEmail={session} onLogout={() => { localStorage.removeItem('session_user'); setSession(null); }} />;
};

// Renderizado directo compatible con Babel Standalone
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);