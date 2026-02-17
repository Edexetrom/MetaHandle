/**
 * MODULO: app.jsx
 * SISTEMA: Control Meta Pro v3.2 (Edición SQL)
 * DESCRIPCIÓN: Implementación con Automation Switch, Stop-Loss % y gestión tabular.
 */

const { useState, useEffect, useCallback, useMemo, useRef } = React;

// --- COMPONENTE: ICON HELPER ---
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
 * ====================================================================
 * COMPONENTE: LOGIN SCREEN
 * ====================================================================
 */
const LoginScreen = ({ onLogin }) => {
    const [email, setEmail] = useState("");

    const handleLogin = (e) => {
        e.preventDefault();
        if (email.includes("@")) onLogin(email);
        else alert("Por favor ingresa un correo válido.");
    };

    return (
        <div className="min-h-screen bg-[#020202] flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-blue-900/40 shadow-2xl animate-pulse">
                    <Icon name="ShieldCheck" size={40} className="text-white" />
                </div>
                <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">Control Meta</h1>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-10 italic">Auditores Panel v3.2 (SQL)</p>

                <form onSubmit={handleLogin} className="space-y-4 text-left">
                    <input
                        type="email" required placeholder="Correo de Auditor"
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-blue-500 outline-none transition-all"
                        onChange={e => setEmail(e.target.value)}
                    />
                    <button className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all shadow-xl">
                        Sincronizar Acceso
                    </button>
                </form>
            </div>
        </div>
    );
};

/**
 * ====================================================================
 * COMPONENTE: DASHBOARD PRINCIPAL
 * ====================================================================
 */
const Dashboard = ({ userEmail }) => {
    const [data, setData] = useState([]);
    const [automationActive, setAutomationActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const API_URL = "https://manejoapi.libresdeumas.com";

    // --- SINCRONIZACIÓN ---
    const sync = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            setData(json.adsets || []);
            setAutomationActive(json.automation_active);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { sync(); }, [sync]);

    // --- ACCIONES SQL ---
    const updateSQL = async (id, key, value) => {
        try {
            await fetch(`${API_URL}/ads/settings/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, key, value: String(value) })
            });
            sync();
        } catch (e) { console.error(e); }
    };

    const toggleAutomation = async () => {
        try {
            const res = await fetch(`${API_URL}/ads/automation/toggle`, { method: 'POST' });
            const json = await res.json();
            setAutomationActive(json.is_active);
        } catch (e) { console.error(e); }
    };

    // --- CÁLCULOS TOTALES ---
    const totals = useMemo(() => {
        return data.reduce((acc, curr) => {
            const ins = curr.meta.insights?.data?.[0] || {};
            acc.spend += parseFloat(ins.spend || 0);
            acc.results += parseInt(ins.actions?.[0]?.value || 0);
            return acc;
        }, { spend: 0, results: 0 });
    }, [data]);

    return (
        <div className="min-h-screen bg-[#020202] text-slate-100 p-4 lg:p-12">

            {/* HEADER: SUMATORIAS Y SWITCH MAESTRO */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-10">
                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between shadow-2xl">
                    <div>
                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Automatización</h3>
                        <p className="text-xl font-black">{automationActive ? "ACTIVA" : "APAGADA"}</p>
                    </div>
                    <button
                        onClick={toggleAutomation}
                        className={`w-16 h-8 rounded-full p-1 transition-all ${automationActive ? 'bg-blue-600' : 'bg-white/10'}`}
                    >
                        <div className={`w-6 h-6 bg-white rounded-full transition-all ${automationActive ? 'translate-x-8' : 'translate-x-0'}`} />
                    </button>
                </div>
                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem]">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Inversión Hoy</p>
                    <p className="text-2xl font-black">${totals.spend.toFixed(2)}</p>
                </div>
                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem]">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Resultados</p>
                    <p className="text-2xl font-black">{totals.results}</p>
                </div>
                <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Auditor</p>
                        <p className="text-xs font-bold truncate max-w-[140px]">{userEmail}</p>
                    </div>
                    <button onClick={sync} className="p-3 bg-white/5 rounded-xl hover:bg-white/10">
                        <Icon name="RefreshCw" className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* TABLA DE CONTROL SQL */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="p-6">Estado</th>
                                <th className="p-6">AdSet</th>
                                <th className="p-6 text-center">Presupuesto</th>
                                <th className="p-6 text-center">Gasto Hoy</th>
                                <th className="p-6 text-center text-blue-500">Stop-Loss %</th>
                                <th className="p-6 text-center">Result.</th>
                                <th className="p-6">Turno</th>
                                <th className="p-6 text-center">Congelado</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {data.map(item => {
                                const { meta, settings } = item;
                                const ins = meta.insights?.data?.[0] || {};
                                const ppto = (parseFloat(meta.daily_budget || 0) / 100);
                                const spend = parseFloat(ins.spend || 0);
                                const perc = ppto > 0 ? (spend / ppto) * 100 : 0;
                                const isOverLimit = perc >= settings.limit_perc;

                                return (
                                    <tr key={meta.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full ${meta.status === 'ACTIVE' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-500/30'}`} />
                                                <span className="font-bold text-slate-500">{meta.status}</span>
                                            </div>
                                        </td>
                                        <td className="p-6 max-w-[200px]">
                                            <p className="font-black text-white uppercase truncate">{meta.name}</p>
                                            <p className="text-[9px] text-slate-600 font-mono">ID: {meta.id}</p>
                                        </td>
                                        <td className="p-6 text-center font-bold">${ppto.toFixed(2)}</td>
                                        <td className="p-6 text-center">
                                            <span className={`px-3 py-1 rounded-lg font-black ${isOverLimit ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/10 text-blue-400'}`}>
                                                ${spend.toFixed(2)} <span className="text-[10px] opacity-50 ml-1">({perc.toFixed(0)}%)</span>
                                            </span>
                                        </td>
                                        <td className="p-6 text-center">
                                            <input
                                                type="number"
                                                className="bg-black border border-white/10 w-16 p-2 rounded-lg text-center text-blue-500 font-black outline-none"
                                                value={settings.limit_perc}
                                                onChange={(e) => updateSQL(meta.id, 'limit_perc', e.target.value)}
                                            />
                                        </td>
                                        <td className="p-6 text-center font-black text-lg">{ins.actions?.[0]?.value || 0}</td>
                                        <td className="p-6">
                                            <select
                                                className="bg-black/50 border border-white/10 p-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400 outline-none"
                                                value={settings.turno}
                                                onChange={(e) => updateSQL(meta.id, 'turno', e.target.value)}
                                            >
                                                <option value="matutino">Matutino</option>
                                                <option value="vespertino">Vespertino</option>
                                                <option value="fsemana">Fsemana</option>
                                            </select>
                                        </td>
                                        <td className="p-6 text-center">
                                            <button
                                                onClick={() => updateSQL(meta.id, 'is_frozen', !settings.is_frozen)}
                                                className={`p-3 rounded-xl transition-all ${settings.is_frozen ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-700'}`}
                                            >
                                                <Icon name={settings.is_frozen ? "Lock" : "Unlock"} size={16} />
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
    const [session, setSession] = useState(null);
    return !session ? <LoginScreen onLogin={setSession} /> : <Dashboard userEmail={session} />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);