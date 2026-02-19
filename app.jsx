/**
 * SISTEMA: Control Meta Pro v5.1 (SQLite Only)
 * CAMBIOS:
 * 1. Eliminado Firebase por completo.
 * 2. Implementado Polling de 30 segundos para sincronizar auditores.
 * 3. Lógica de días L-V y nombres sin truncar.
 */
const { useState, useEffect, useMemo } = React;

const Icon = ({ name, size = 16, className = "" }) => {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (window.lucide) { window.lucide.createIcons(); setReady(true); }
    }, [name]);
    return <i data-lucide={name} className={className} style={{ width: size, height: size }}></i>;
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
    const [data, setData] = useState({ meta: [], settings: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [loading, setLoading] = useState(true);

    // Función de Sincronización (Reemplaza a Firebase)
    const sync = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            setData(json);
        } catch (e) { console.error("Sync Error:", e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        sync();
        // Polling: Cada 30 segundos consultamos al servidor para ver cambios de otros auditores
        const interval = setInterval(() => sync(true), 30000);
        return () => clearInterval(interval);
    }, []);

    const updateAdSet = async (id, key, val, logMsg = null) => {
        // Actualización optimista en UI
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
    };

    const sortedData = useMemo(() => {
        return [...data.meta]
            .filter(ad => ALLOWED_IDS.includes(ad.id))
            .sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }, [data.meta]);

    const stats = useMemo(() => sortedData.reduce((acc, ad) => {
        const i = ad.insights?.data?.[0] || {};
        acc.s += parseFloat(i.spend || 0); acc.r += parseInt(i.actions?.[0]?.value || 0);
        if (ad.status === 'ACTIVE') acc.a++; return acc;
    }, { s: 0, r: 0, a: 0 }), [sortedData]);

    if (loading && !data.meta.length) return <div className="min-h-screen bg-black flex items-center justify-center text-blue-500 font-black italic uppercase animate-pulse">Iniciando SQLite Engine...</div>;

    return (
        <div className="min-h-screen bg-black text-white p-6 lg:p-12 font-sans animate-in">
            {/* SUMATORIAS */}
            <header className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between shadow-2xl">
                    <div><p className="text-[10px] font-black text-blue-500 uppercase">Automatización</p><p className="text-xl font-black italic">{data.automation_active ? 'SISTEMA ACTIVO' : 'SISTEMA APAGADO'}</p></div>
                    <button onClick={toggleAuto} className={`w-14 h-7 rounded-full p-1 transition-all ${data.automation_active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 bg-white rounded-full transition-all ${data.automation_active ? 'translate-x-7' : ''}`} />
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

            {/* NOTIFICACIONES */}
            <div className="space-y-2 mb-8">
                {data.logs.map((l, i) => (
                    <div key={i} className="bg-blue-600/5 border border-blue-500/10 p-3 rounded-xl flex items-center gap-2 text-[10px] font-bold uppercase">
                        <Icon name="bell" size={12} className="text-blue-500" /><span className="text-blue-400">{l.user}</span> {l.msg}
                    </div>
                ))}
            </div>

            {/* TABLA - SIN TRUNCADO */}
            <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-[9px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                <th className="p-6">LED</th><th className="p-6">NOMBRE COMPLETO ADSET</th>
                                <th className="p-6 text-center">GASTO</th><th className="p-6 text-center text-blue-500">STOP %</th>
                                <th className="p-6 text-center">RES.</th><th className="p-6">TURNO / DIAS</th><th className="p-6 text-center">FREEZE</th>
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
                                    <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.02] ${s.is_frozen ? 'opacity-40' : ''}`}>
                                        <td className="p-6"><Icon name="circle" size={10} className={ad.status === 'ACTIVE' ? 'text-emerald-500 fill-emerald-500' : 'text-rose-500 fill-rose-500'} /></td>
                                        <td className="p-6 whitespace-normal leading-relaxed font-black uppercase text-xs w-[450px]">{ad.name}</td>
                                        <td className="p-6 text-center">
                                            <div className={`inline-block px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                                                ${spend.toFixed(2)} ({perc.toFixed(0)}%)
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <input type="number" className="bg-black border border-white/10 w-16 p-2 rounded text-center text-blue-500 font-black outline-none"
                                                value={s.limit_perc} onBlur={(e) => updateAdSet(ad.id, 'limit_perc', parseFloat(e.target.value), `Cambió límite a ${e.target.value}% en AdSet ${ad.id}`)} />
                                        </td>
                                        <td className="p-6 text-center font-black">{i.actions?.[0]?.value || 0}</td>
                                        <td className="p-6">
                                            <input type="text" className="bg-black/50 border border-white/10 p-2 rounded text-[10px] font-black uppercase text-zinc-300 w-32 outline-none"
                                                defaultValue={s.turno} onBlur={(e) => updateAdSet(ad.id, 'turno', e.target.value)} />
                                        </td>
                                        <td className="p-6 text-center">
                                            <button onClick={() => updateAdSet(ad.id, 'is_frozen', !s.is_frozen, `${!s.is_frozen ? 'Congeló' : 'Descongeló'} AdSet ${ad.id}`)}
                                                className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 text-white' : 'bg-white/5 text-zinc-700'}`}>
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
    return !session ? <div className="p-20 text-blue-500 font-black text-center" onClick={() => { localStorage.setItem('session_user', 'Auditor'); setSession('Auditor'); }}>Haga clic para simular Login de Auditor</div>
        : <Dashboard userEmail={session} onLogout={() => { localStorage.removeItem('session_user'); setSession(null); }} />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);