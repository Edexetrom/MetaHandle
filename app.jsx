/**
 * MODULO: app.jsx
 * SISTEMA: Control Meta Pro v3.7 (Optimistic UI Edition)
 * DESCRIPCIÓN: Implementación de actualizaciones instantáneas sin espera de DB.
 */

const { useState, useEffect, useCallback, useMemo, useRef } = React;

// --- COMPONENTE: ICON HELPER (Evita Error #130) ---
const Icon = ({ name, size = 16, className = "" }) => {
    const iconRef = useRef(null);
    useEffect(() => {
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons({
                icons: { [name]: window.lucide[name] },
                attrs: { 'stroke-width': 2, 'width': size, 'height': size, 'class': className }
            });
        }
    }, [name, size, className]);
    return <i data-lucide={name} ref={iconRef} className={className} style={{ display: 'inline-block', width: size, height: size }}></i>;
};

/**
 * COMPONENTE: Celda Editable de Límite (Optimista)
 */
const EditableLimit = ({ id, initialValue, onSave }) => {
    const [val, setVal] = useState(initialValue);
    useEffect(() => { setVal(initialValue); }, [initialValue]);

    const handleBlur = () => {
        if (val !== initialValue) {
            onSave(id, 'limit_perc', val);
        }
    };

    return (
        <input
            type="number"
            className="bg-black border border-white/10 w-16 p-2 rounded-lg text-center text-blue-500 font-black outline-none focus:border-blue-500 transition-all"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={handleBlur}
        />
    );
};

/**
 * COMPONENTE: Panel de Configuración de Turnos
 */
const TurnConfigPanel = ({ turns, onUpdate }) => {
    if (!turns) return null;

    return (
        <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] mb-10 shadow-2xl">
            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Icon name="Settings2" size={14} /> Configuración Global de Horarios
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.keys(turns).map(key => (
                    <div key={key} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-wider">{key}</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500">Inicio (H):</span>
                                <input
                                    type="number" step="0.5"
                                    className="bg-transparent border-b border-white/10 w-12 text-right text-white outline-none focus:border-blue-500"
                                    defaultValue={turns[key].start}
                                    onBlur={(e) => onUpdate(key, 'start_hour', e.target.value)}
                                />
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500">Fin (H):</span>
                                <input
                                    type="number" step="0.5"
                                    className="bg-transparent border-b border-white/10 w-12 text-right text-white outline-none focus:border-blue-500"
                                    defaultValue={turns[key].end}
                                    onBlur={(e) => onUpdate(key, 'end_hour', e.target.value)}
                                />
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500">Días:</span>
                                <input
                                    type="text"
                                    className="bg-transparent border-b border-white/10 w-16 text-right text-blue-400 outline-none focus:border-blue-500"
                                    defaultValue={turns[key].days}
                                    onBlur={(e) => onUpdate(key, 'days', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/**
 * ====================================================================
 * MODULO: LOGIN SCREEN
 * ====================================================================
 */
const LoginScreen = ({ onLogin, apiUrl }) => {
    const [auditors, setAuditors] = useState([]);
    const [selectedAuditor, setSelectedAuditor] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchAuditors = async () => {
            try {
                const res = await fetch(`${apiUrl}/auth/auditors`);
                const json = await res.json();
                setAuditors(json.auditors || []);
                if (json.auditors?.length > 0) setSelectedAuditor(json.auditors[0]);
            } catch (e) { setError("Error de conexión."); }
        };
        fetchAuditors();
    }, [apiUrl]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: selectedAuditor, password })
            });
            if (res.ok) {
                localStorage.setItem('meta_auditor_session', selectedAuditor);
                onLogin(selectedAuditor);
            } else {
                setError("Credenciales incorrectas.");
            }
        } catch (e) { setError("Fallo de autenticación."); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-[#020202] flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-blue-900/40 shadow-2xl">
                    <Icon name="ShieldCheck" size={40} className="text-white" />
                </div>
                <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">Control Meta</h1>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-10 italic">Auditores Dashboard v3.7</p>

                <form onSubmit={handleLogin} className="space-y-6 text-left">
                    {error && <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl text-rose-500 text-[10px] font-black uppercase text-center">{error}</div>}
                    <select
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                        value={selectedAuditor}
                        onChange={e => setSelectedAuditor(e.target.value)}
                    >
                        {auditors.map(name => (<option key={name} value={name}>{name}</option>))}
                    </select>
                    <input
                        type="password" required placeholder="Contraseña"
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-blue-500 outline-none transition-all"
                        onChange={e => setPassword(e.target.value)}
                    />
                    <button disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all shadow-xl">
                        {loading ? "Verificando..." : "Entrar"}
                    </button>
                </form>
            </div>
        </div>
    );
};

/**
 * ====================================================================
 * MODULO: DASHBOARD PRINCIPAL
 * ====================================================================
 */
const Dashboard = ({ userEmail, onLogout, apiUrl }) => {
    const [data, setData] = useState([]);
    const [turns, setTurns] = useState(null);
    const [automationActive, setAutomationActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(new Date());

    // --- SINCRONIZACIÓN (Base) ---
    const sync = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/ads/sync`);
            const json = await res.json();
            setData(json.adsets || []);
            setTurns(json.turns);
            setAutomationActive(json.automation_active);
            setLastSync(new Date());
        } catch (e) { console.error("Sync error:", e); }
        finally { setLoading(false); }
    }, [apiUrl]);

    useEffect(() => {
        sync();
        const interval = setInterval(() => sync(true), 300000); // 5 min
        return () => clearInterval(interval);
    }, [sync]);

    /**
     * ACCIONES OPTIMISTAS (No esperan al servidor para actualizar la UI)
     */
    const updateSQL = (id, key, value) => {
        // 1. Actualización inmediata en la UI
        setData(prev => prev.map(item =>
            item.meta.id === id
                ? { ...item, settings: { ...item.settings, [key]: (key === 'is_frozen' ? value : value) } }
                : item
        ));

        // 2. Envío al servidor en segundo plano
        fetch(`${apiUrl}/ads/settings/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, key, value: String(value) })
        }).catch(err => console.error("Error persistiendo cambio:", err));
    };

    const toggleStatusManual = (id, currentStatus) => {
        const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

        // 1. Cambio visual instantáneo
        setData(prev => prev.map(item =>
            item.meta.id === id
                ? { ...item, meta: { ...item.meta, status: nextStatus } }
                : item
        ));

        // 2. Envío a Meta en segundo plano
        fetch(`${apiUrl}/ads/settings/update_meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: nextStatus })
        }).catch(err => console.error("Error en Meta:", err));
    };

    const updateTurnConfig = (name, field, value) => {
        // Actualización local rápida
        setTurns(prev => ({
            ...prev,
            [name]: { ...prev[name], [field.includes('hour') ? field : 'days']: value }
        }));

        const turn = turns[name];
        const payload = { ...turn, [field.includes('hour') ? field : 'days']: value, name };
        if (field.includes('hour')) payload[field] = parseFloat(value);

        fetch(`${apiUrl}/ads/turns/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error("Error en turnos:", err));
    };

    const toggleAutomation = () => {
        const nextState = !automationActive;
        setAutomationActive(nextState);

        fetch(`${apiUrl}/ads/automation/toggle`, { method: 'POST' })
            .catch(err => {
                console.error(err);
                setAutomationActive(!nextState); // Rollback si falla
            });
    };

    // --- ORDENAMIENTO Y TOTALES ---
    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => {
            if (a.meta.status === 'ACTIVE' && b.meta.status !== 'ACTIVE') return -1;
            if (a.meta.status !== 'ACTIVE' && b.meta.status === 'ACTIVE') return 1;
            return 0;
        });
    }, [data]);

    const totals = useMemo(() => {
        return data.reduce((acc, curr) => {
            const ins = curr.meta.insights?.data?.[0] || {};
            acc.spend += parseFloat(ins.spend || 0);
            acc.results += parseInt(ins.actions?.[0]?.value || 0);
            return acc;
        }, { spend: 0, results: 0 });
    }, [data]);

    return (
        <div className="min-h-screen bg-[#020202] text-slate-100 p-4 lg:p-12 font-sans animate-in">

            {/* HEADER */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-10">
                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <Icon name="Cpu" size={12} /> Automatización
                        </h3>
                        <p className="text-xl font-black">{automationActive ? "ACTIVA" : "APAGADA"}</p>
                    </div>
                    <button
                        onClick={toggleAutomation}
                        className={`w-16 h-8 rounded-full p-1 transition-all relative z-10 ${automationActive ? 'bg-blue-600' : 'bg-white/10'}`}
                    >
                        <div className={`w-6 h-6 bg-white rounded-full transition-all ${automationActive ? 'translate-x-8' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-xl">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Inversión Hoy</p>
                    <p className="text-2xl font-black text-white">${totals.spend.toFixed(2)}</p>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-xl">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Resultados</p>
                    <p className="text-2xl font-black text-white">{totals.results}</p>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between shadow-xl">
                    <div>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 truncate max-w-[120px]">Auditor: {userEmail}</p>
                        <button onClick={onLogout} className="text-[9px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest flex items-center gap-1">
                            <Icon name="LogOut" size={10} /> Salir
                        </button>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <button onClick={() => sync()} className="p-3 bg-white/5 rounded-xl hover:bg-white/10">
                            <Icon name="RefreshCw" className={loading ? "animate-spin" : ""} />
                        </button>
                        <p className="text-[8px] text-slate-600 font-mono italic">Sync: {lastSync.toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>

            <TurnConfigPanel turns={turns} onUpdate={updateTurnConfig} />

            {/* TABLA */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="p-6">Estado</th>
                                <th className="p-6">AdSet</th>
                                <th className="p-6 text-center">Ppto</th>
                                <th className="p-6 text-center">Gasto Hoy</th>
                                <th className="p-6 text-center text-blue-500">Stop-Loss %</th>
                                <th className="p-6 text-center">Result.</th>
                                <th className="p-6">Turno</th>
                                <th className="p-6 text-center">Congelado</th>
                                <th className="p-6 text-center">Manual</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {sortedData.map(item => {
                                const { meta, settings } = item;
                                const ins = meta.insights?.data?.[0] || {};
                                const ppto = (parseFloat(meta.daily_budget || 0) / 100);
                                const spend = parseFloat(ins.spend || 0);
                                const perc = ppto > 0 ? (spend / ppto) * 100 : 0;
                                const isOverLimit = perc >= settings.limit_perc;

                                return (
                                    <tr key={meta.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all group">
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full transition-all duration-300 ${meta.status === 'ACTIVE' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-rose-500/30'}`} />
                                                <span className="font-bold text-slate-500 uppercase text-[9px] tracking-widest">{meta.status}</span>
                                            </div>
                                        </td>
                                        <td className="p-6 max-w-[200px]">
                                            <p className="font-bold text-white uppercase truncate tracking-tight group-hover:text-blue-400 transition-colors">{meta.name}</p>
                                            <p className="text-[9px] text-slate-600 font-mono mt-1 italic">ID: {meta.id}</p>
                                        </td>
                                        <td className="p-6 text-center font-bold text-slate-300">
                                            ${ppto.toFixed(0)}
                                        </td>
                                        <td className="p-6 text-center">
                                            <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${isOverLimit ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/10 text-blue-400'}`}>
                                                ${spend.toFixed(2)} <span className="text-[9px] opacity-60 ml-1">({perc.toFixed(0)}%)</span>
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <EditableLimit
                                                id={meta.id}
                                                initialValue={settings.limit_perc}
                                                onSave={updateSQL}
                                            />
                                        </td>
                                        <td className="p-6 text-center font-black text-white text-base">
                                            {ins.actions?.[0]?.value || 0}
                                        </td>
                                        <td className="p-6">
                                            <select
                                                className="bg-black/50 border border-white/10 text-[9px] p-2.5 rounded-xl text-slate-300 outline-none w-full font-black uppercase tracking-widest cursor-pointer"
                                                value={settings.turno}
                                                onChange={(e) => updateSQL(meta.id, 'turno', e.target.value)}
                                            >
                                                <option value="matutino">Matutino</option>
                                                <option value="vespertino">Vespertino</option>
                                                <option value="fsemana">F-Semana</option>
                                            </select>
                                        </td>
                                        <td className="p-6 text-center">
                                            <button
                                                onClick={() => updateSQL(meta.id, 'is_frozen', !settings.is_frozen)}
                                                className={`p-3 rounded-xl transition-all duration-200 ${settings.is_frozen ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-slate-700 hover:text-white'}`}
                                            >
                                                <Icon name={settings.is_frozen ? "Lock" : "Unlock"} size={16} />
                                            </button>
                                        </td>
                                        <td className="p-6 text-center">
                                            <button
                                                onClick={() => toggleStatusManual(meta.id, meta.status)}
                                                className={`w-11 h-6 rounded-full p-1 transition-all duration-300 ${meta.status === 'ACTIVE' ? 'bg-blue-600' : 'bg-white/10'}`}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full transition-all duration-300 ${meta.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'}`} />
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
    const [session, setSession] = useState(localStorage.getItem('meta_auditor_session'));
    const API_URL = "https://manejoapi.libresdeumas.com";

    const handleLogout = () => {
        localStorage.removeItem('meta_auditor_session');
        setSession(null);
    };

    return !session ? (
        <LoginScreen onLogin={setSession} apiUrl={API_URL} />
    ) : (
        <Dashboard userEmail={session} onLogout={handleLogout} apiUrl={API_URL} />
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);