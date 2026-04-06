/**
 * SISTEMA: Control Meta Pro v3.0 (Fase 1, 2 y 3)
 * AJUSTES: 
 * 1. Arquitectura Modular y Entorno Dinámico.
 * 2. Nuevas Columnas Panel (Inversión Extendida, Alertas, Límite de Puja).
 * 3. Gestión Blackout Dates (Turnos Festivos).
 * 4. Pestaña de Gestión de Medios (Rotación Creativa).
 */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// --- COMPONENTE: ICONOS ---
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
                nameAttr: 'data-lucide', root: iconRef.current
            });
        }
    }, [name, size, className, spin]);
    return <span ref={iconRef} className="inline-flex items-center justify-center pointer-events-none" style={{ width: size, height: size }} />;
};

// --- COMPONENTE: INPUT OPTIMIZADO ---
const FluidInput = ({ value, onSave, className, type = "number", step = "1", prefix=""}) => {
    const [localValue, setLocalValue] = useState(value);
    const [isEditing, setIsEditing] = useState(false);
    useEffect(() => { if (!isEditing) setLocalValue(value); }, [value, isEditing]);
    const handleBlur = () => {
        setIsEditing(false);
        if (localValue !== value) onSave(type === "number" ? parseFloat(localValue) : localValue);
    };
    return (
        <input
            type={type} step={step} className={className}
            value={localValue} onFocus={() => setIsEditing(true)}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
        />
    );
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
            <button onClick={() => setIsOpen(!isOpen)} className="bg-black/40 border border-white/10 p-2.5 rounded-xl text-[10px] font-black uppercase text-zinc-400 w-36 flex justify-between items-center hover:bg-black/60 transition-all">
                <span className="truncate">{activeList.length > 0 ? activeList.join(', ') : 'Sin Turnos'}</span>
                <Icon name="ChevronDown" size={10} />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in duration-200">
                    <p className="text-[8px] font-black text-zinc-500 uppercase p-2 border-b border-white/5 mb-1 text-center">Turnos</p>
                    {Object.keys(availableTurns).map(name => (
                        <div key={name} onClick={() => toggleTurno(name)} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all">
                            <div className={`w-3 h-3 rounded-full border ${activeList.includes(name.toLowerCase()) ? 'bg-blue-500 border-blue-400' : 'border-white/20'}`}></div>
                            <span className={`text-[10px] font-bold uppercase ${activeList.includes(name.toLowerCase()) ? 'text-white' : 'text-zinc-500'}`}>{name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- COMPONENTE: SELECTOR DE DIAS ---
const DaySelector = ({ value, onUpdate }) => {
    const daysMap = [
        { key: 'L', label: 'L' }, { key: 'M', label: 'M' }, { key: 'X', label: 'M' },
        { key: 'J', label: 'J' }, { key: 'V', label: 'V' }, { key: 'S', label: 'S' },
        { key: 'D', label: 'D' }
    ];
    
    const activeDays = useMemo(() => {
        if (!value) return [];
        if (value === "L-V") return ['L', 'M', 'X', 'J', 'V'];
        if (value === "S") return ['S'];
        if (value === "D") return ['D'];
        return value.split(',').map(d => d.trim().toUpperCase());
    }, [value]);
    
    const toggleDay = (key) => {
        let newDays = [...activeDays];
        if (newDays.includes(key)) newDays = newDays.filter(k => k !== key);
        else newDays.push(key);
        
        newDays.sort((a, b) => daysMap.findIndex(d => d.key === a) - daysMap.findIndex(d => d.key === b));
        onUpdate(newDays.join(','));
    };
    
    return (
        <div className="flex gap-2 justify-center">
            {daysMap.map(d => (
                <button
                    key={d.key}
                    onClick={() => toggleDay(d.key)}
                    className={`w-8 h-8 rounded-full text-[10px] font-black transition-all flex items-center justify-center ${activeDays.includes(d.key) ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-black text-zinc-500 border border-white/10 hover:border-white/20'}`}
                >
                    {d.label}
                </button>
            ))}
        </div>
    );
};

const floatToTime = (val) => {
    const v = parseFloat(val) || 0;
    const h = Math.floor(v);
    const m = Math.round((v - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const timeToFloat = (val) => {
    if (!val) return 0;
    const [h, m] = val.toString().split(':');
    return parseInt(h || 0) + (parseInt(m || 0) / 60);
};

const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
    ? "http://localhost:8000" 
    : "https://manejoapi.libresdeumas.com";

const ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717", "120238886420220717", 
    "120238886413960717", "120238886369210717", "120234721717970717", "120234721717960717", 
    "120234721717950717", "120233618279570717", "120233618279540717", "120233611687810717", 
    "120232204774610717", "120232204774590717", "120232204774570717", "120232157515490717", 
    "120232157515480717", "120232157515460717"
];

// --- VISTA DASHBOARD ---
const Dashboard = ({ userEmail, onLogout }) => {
    const [data, setData] = useState({ meta: [], settings: {}, turns: {}, automation_active: false, logs: [] });
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkLimit, setBulkLimit] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [view, setView] = useState('panel'); // panel | turnos | medios
    const [newTurnName, setNewTurnName] = useState("");
    const [holidays, setHolidays] = useState([]);
    const [newHoliday, setNewHoliday] = useState("");
    const [mediosData, setMediosData] = useState([]);

    const fetchSync = useCallback(async (silent = false) => {
        if (!silent) setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ads/sync`);
            const json = await res.json();
            if (json) setData(json);
            
            // Si estamos en vista de turnos, obtén los holidays
            if (view === 'turnos') {
                const resH = await fetch(`${API_URL}/holidays/`);
                const jsonH = await resH.json();
                setHolidays(jsonH.dates || []);
            }
            
            // Si estamos en vista de medios, obtén los medios
            if (view === 'medios') {
                const resM = await fetch(`${API_URL}/ads/medios`);
                const jsonM = await resM.json();
                setMediosData(jsonM.data || []);
            }
            
        } catch (e) { console.error("Sync Error", e); }
        finally { if (!silent) setSyncing(false); }
    }, [view]);

    useEffect(() => {
        fetchSync();
        const interval = setInterval(() => fetchSync(true), 15000); // 15s refetch
        return () => clearInterval(interval);
    }, [fetchSync]);

    const handleBulkAction = async () => {
        if (!bulkLimit || !selectedIds.length) return;
        setSyncing(true);
        await fetch(`${API_URL}/ads/bulk-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds, limit_perc: bulkLimit, user: userEmail })
        });
        setBulkLimit(""); setSelectedIds([]);
        fetchSync(true);
    };

    const toggleMetaStatus = async (id, currentStatus) => {
        const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        setData(prev => ({ ...prev, meta: prev.meta.map(ad => ad.id === id ? { ...ad, status: nextStatus } : ad) }));
        await fetch(`${API_URL}/ads/meta-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: nextStatus, user: userEmail }) });
        fetchSync(true);
    };

    const updateSetting = async (id, key, val) => {
        setData(prev => ({ ...prev, settings: { ...prev.settings, [id]: { ...prev.settings[id], [key]: val } } }));
        await fetch(`${API_URL}/ads/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, [key]: val, user: userEmail }) });
    };

    const updateBid = async (id, bidValDollar) => {
        const bidValCents = Math.round(parseFloat(bidValDollar) * 100);
        const adIdx = data.meta.findIndex(a => a.id === id);
        if(adIdx > -1) {
            const newMeta = [...data.meta];
            newMeta[adIdx].bid_amount = bidValCents;
            setData(prev => ({...prev, meta: newMeta}));
        }
        await fetch(`${API_URL}/ads/bid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, bid_amount: bidValCents, user: userEmail }) });
    };

    const addHoliday = async () => {
        if(!newHoliday) return;
        await fetch(`${API_URL}/holidays/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: newHoliday, user: userEmail }) });
        setNewHoliday("");
        fetchSync(true);
    };

    const removeHoliday = async (dateStr) => {
        await fetch(`${API_URL}/holidays/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: dateStr, user: userEmail }) });
        fetchSync(true);
    };

    const toggleMedio = async (onId, offId) => {
        setSyncing(true);
        await fetch(`${API_URL}/ads/medios/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad_id_on: onId, ad_id_off: offId, user: userEmail }) });
        fetchSync();
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        // Pequeño workaround de feedback
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
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Inversión Hoy / Activos</p>
                    <p className="text-2xl font-black uppercase tracking-tighter">${stats.s.toFixed(2)} / {stats.a}</p>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Resultados Totales</p>
                    <p className="text-2xl font-black uppercase tracking-tighter">{stats.r}</p>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5 flex items-center justify-between">
                    <div className="truncate"><p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Auditor</p><p className="text-xs font-bold truncate">{userEmail}</p></div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowLogs(!showLogs)} className="p-2 bg-white/5 rounded-xl"><Icon name="Bell" size={18} className={data.logs.length > 0 ? "text-blue-500" : "text-zinc-500"} /></button>
                        <button onClick={onLogout} className="p-2 text-rose-600 hover:text-rose-400 transition-all"><Icon name="LogOut" size={18} /></button>
                    </div>
                </div>
            </header>

            <div className="flex gap-4 mb-6">
                <button onClick={() => setView('panel')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'panel' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Panel Control</button>
                <button onClick={() => setView('turnos')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'turnos' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Gestión Turnos</button>
                <button onClick={() => setView('medios')} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'medios' ? 'bg-blue-600 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>Medios</button>
                
                <button onClick={() => fetchSync()} className="ml-auto bg-zinc-900 p-3 rounded-xl border border-white/5 transition-all"><Icon name="RefreshCw" spin={syncing} size={16} className="text-blue-500" /></button>
            </div>

            {view === 'panel' && (
                <>
                    {/* ACCIÓN MASIVA */}
                    <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-white/5 mb-8 flex flex-wrap items-center gap-6 shadow-xl animate-fade-in">
                        <div className="flex items-center gap-3 bg-black p-3 px-6 rounded-2xl border border-white/10 shadow-inner">
                            <Icon name="Zap" size={14} className="text-blue-500" /><span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Límite Masivo:</span>
                            <input type="number" className="bg-zinc-800 w-16 p-1 text-center text-xs rounded outline-none text-blue-500 font-bold" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} />
                            <button onClick={handleBulkAction} className="bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded uppercase hover:bg-blue-500 transition-all">Aplicar a {selectedIds.length}</button>
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl animate-fade-in">
                        <div className="overflow-x-auto text-left">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-black text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="p-6">Sel.</th>
                                        <th className="p-6">LED / Manual</th>
                                        <th className="p-6 min-w-[350px]">Nombre Completo del AdSet</th>
                                        <th className="p-6 text-center">Inversión</th>
                                        <th className="p-6 text-center">Puja (Cts)</th>
                                        <th className="p-6 text-center text-blue-500">Stop %</th>
                                        <th className="p-6 text-center">Resultados</th>
                                        <th className="p-6">Turnos</th>
                                        <th className="p-6 text-center">Freeze</th>
                                        <th className="p-6 text-center">A.</th>
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
                                        
                                        // Validación de Errores (issues_info)
                                        const hasIssues = ad.issues_info && ad.issues_info.length > 0;

                                        return (
                                            <tr key={ad.id} className={`border-b border-white/5 hover:bg-white/[0.01] transition-all ${s.is_frozen ? 'opacity-30' : ''}`}>
                                                <td className="p-6"><input type="checkbox" className="accent-blue-600 w-4 h-4 cursor-pointer" checked={selectedIds.includes(ad.id)} onChange={e => e.target.checked ? setSelectedIds([...selectedIds, ad.id]) : setSelectedIds(selectedIds.filter(x => x !== ad.id))} /></td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-3.5 h-3.5 rounded-full transition-all duration-500 ${active ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-rose-900/30 border border-rose-500/10'}`}></div>
                                                        <button onClick={() => toggleMetaStatus(ad.id, ad.status)} className={`px-2 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${active ? 'bg-zinc-800 text-zinc-500 hover:text-rose-500' : 'bg-emerald-600 text-white shadow-lg'}`}>{active ? 'Apagar' : 'Prender'}</button>
                                                    </div>
                                                </td>
                                                <td className="p-6 font-black text-[11px] italic tracking-tight leading-relaxed">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="uppercase">{ad.name}</span>
                                                        <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 normal-case font-bold">
                                                            <span>{ad.id}</span>
                                                            <button onClick={() => copyToClipboard(ad.id)} title="Copiar ID" className="hover:text-blue-400 transition-all">
                                                                <Icon name="Copy" size={10} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* INVERSION FORMATO $Gastado / $Presupuesto */}
                                                <td className="p-6 text-center">
                                                    <div className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl font-black ${perc >= s.limit_perc ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' : 'text-blue-400 bg-blue-500/10'}`}>
                                                        <span>${spend.toFixed(2)} / ${budget.toFixed(2)}</span>
                                                        <span className="text-[9px]">({perc.toFixed(0)}%)</span>
                                                    </div>
                                                </td>
                                                {/* LIMITE DE PUJA */}
                                                <td className="p-6 text-center">
                                                    <FluidInput 
                                                        value={ad.bid_amount ? Number(ad.bid_amount / 100).toFixed(2) : "0.00"} 
                                                        step="0.01"
                                                        className="bg-black border border-white/10 w-20 p-2 rounded-xl text-center text-emerald-500 font-black outline-none" 
                                                        onSave={(val) => updateBid(ad.id, val)} 
                                                    />
                                                </td>
                                                <td className="p-6 text-center"><FluidInput value={s.limit_perc} className="bg-black border border-white/10 w-16 p-2 rounded-xl text-center text-blue-500 font-black outline-none" onSave={(val) => updateSetting(ad.id, 'limit_perc', val)} /></td>
                                                <td className="p-6 text-center font-black text-white text-base">{i.actions?.[0]?.value || 0}</td>
                                                <td className="p-6"><TurnSelector currentTurnos={s.turno} availableTurns={data.turns} onUpdate={(val) => updateSetting(ad.id, 'turno', val)} /></td>
                                                <td className="p-6 text-center"><button onClick={() => updateSetting(ad.id, 'is_frozen', !s.is_frozen)} className={`p-3 rounded-xl transition-all ${s.is_frozen ? 'bg-blue-600 shadow-lg' : 'bg-zinc-800 text-zinc-600'}`}><Icon name={s.is_frozen ? "Lock" : "Unlock"} size={14} /></button></td>
                                                
                                                {/* ALERTAS */}
                                                <td className="p-6 text-center relative group">
                                                    {hasIssues ? (
                                                        <>
                                                            <div className="text-amber-500 animate-pulse"><Icon name="AlertTriangle" size={16} /></div>
                                                            <div className="absolute right-10 top-1/2 -translate-y-1/2 w-48 bg-zinc-800 text-[10px] text-white p-3 rounded-xl shadow-xl hidden group-hover:block z-50">
                                                                {JSON.stringify(ad.issues_info)}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Icon name="CheckCircle" className="text-zinc-700" size={14} />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {view === 'turnos' && (
                <div className="animate-fade-in text-left space-y-8">
                    {/* BLACKOUT DATES / FESTIVOS */}
                    <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-rose-500/10 shadow-xl mb-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-rose-500/10 p-3 rounded-[1.5rem]"><Icon name="CalendarOff" className="text-rose-500" size={24} /></div>
                            <h2 className="text-xl font-black uppercase text-rose-100 pr-12">Días Festivos (Blackout)</h2>
                            <p className="text-xs text-zinc-500 font-bold ml-auto max-w-sm text-right">Los AdSets no się encenderán estos días.</p>
                        </div>
                        <div className="flex gap-4 items-center">
                            <input 
                                type="date" 
                                className="bg-zinc-800 p-3 rounded-xl outline-none text-white font-bold [color-scheme:dark] border border-white/10" 
                                value={newHoliday} 
                                onChange={e => setNewHoliday(e.target.value)} 
                            />
                            <button onClick={addHoliday} className="bg-rose-600 px-6 py-3 rounded-xl font-black uppercase hover:bg-rose-500 transition-all text-xs">Añadir</button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-6">
                            {holidays.map(d => (
                                <div key={d} className="bg-black border border-white/5 py-1.5 px-3 rounded-xl flex items-center gap-3 text-xs font-bold shadow-inner">
                                    <span className="text-rose-400">{d}</span>
                                    <button onClick={() => removeHoliday(d)} className="text-zinc-600 hover:text-rose-500"><Icon name="X" size={12}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CREAR TURNO PERSONALIZADO */}
                    <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-white/5 flex flex-wrap items-center gap-6 shadow-xl">
                        <div className="flex items-center gap-3 bg-black p-3 px-6 rounded-2xl border border-white/10 shadow-inner w-full md:w-auto">
                            <Icon name="Plus" size={14} className="text-blue-500" />
                            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest whitespace-nowrap">Nuevo Turno:</span>
                            <input 
                                type="text" 
                                className="bg-zinc-800 flex-1 md:w-48 p-2 text-xs rounded-xl outline-none text-white font-bold" 
                                placeholder="Nombre (ej. Especial)" 
                                value={newTurnName} 
                                onChange={e => setNewTurnName(e.target.value)} 
                            />
                            <button 
                                onClick={async () => {
                                    if (!newTurnName) return;
                                    const normalized = newTurnName.trim().toLowerCase();
                                    if (data.turns[normalized]) return alert('El turno ya existe');
                                    await fetch(`${API_URL}/turns/update`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ name: normalized, start: 0, end: 0, days: "L,M,X,J,V" })
                                    });
                                    setNewTurnName('');
                                    fetchSync(true);
                                }}
                                className="bg-blue-600 text-[10px] font-black px-4 py-2 rounded-xl uppercase hover:bg-blue-500 transition-all text-white whitespace-nowrap"
                            >
                                Crear
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {Object.entries(data.turns).map(([name, config]) => {
                            const isPredefined = ['matutino normal', 'matutino especial', 'vespertino', 'nocturno', 'fsemana'].includes(name.toLowerCase());
                            return (
                                <div key={name} className="bg-zinc-900/50 p-10 rounded-[3rem] border border-white/5 shadow-2xl relative">
                                    {!isPredefined && (
                                        <button 
                                            onClick={async () => {
                                                if(window.confirm(`¿Deseas eliminar el turno ${name}?`)) {
                                                    await fetch(`${API_URL}/turns/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                                                    fetchSync(true);
                                                }
                                            }}
                                            className="absolute top-8 right-8 p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                                            title="Eliminar turno personalizado"
                                        >
                                            <Icon name="Trash2" size={16} />
                                        </button>
                                    )}
                                    <div className="flex items-center gap-3 mb-8"><div className="bg-blue-600/10 p-3 rounded-[1.5rem]"><Icon name="Clock" className="text-blue-500" size={24} /></div><h2 className="text-xl font-black uppercase text-zinc-100 pr-12">{name}</h2></div>
                                    <div className="space-y-6">
                                        <div><label className="text-[10px] font-black text-zinc-500 uppercase block mb-3">Inicio (24h)</label>
                                            <FluidInput type="time" value={floatToTime(config.start)} className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold outline-none [color-scheme:dark]" onSave={async (val) => {
                                                const startFloat = timeToFloat(val);
                                                await fetch(`${API_URL}/turns/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, start: startFloat, end: config.end, days: config.days }) });
                                                fetchSync(true);
                                            }} />
                                        </div>
                                        <div><label className="text-[10px] font-black text-zinc-500 uppercase block mb-3">Fin (24h)</label>
                                            <FluidInput type="time" value={floatToTime(config.end)} className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white font-bold outline-none [color-scheme:dark]" onSave={async (val) => {
                                                const endFloat = timeToFloat(val);
                                                await fetch(`${API_URL}/turns/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, start: config.start, end: endFloat, days: config.days }) });
                                                fetchSync(true);
                                            }} />
                                        </div>
                                        <div><label className="text-[10px] font-black text-zinc-500 uppercase block mb-3">Días Activos</label>
                                            <div className="bg-black border border-white/10 p-3 rounded-2xl">
                                                <DaySelector value={config.days} onUpdate={async (val) => {
                                                    await fetch(`${API_URL}/turns/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, start: config.start, end: config.end, days: val }) });
                                                    fetchSync(true);
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {view === 'medios' && (
                <div className="animate-fade-in text-left space-y-8">
                    <div className="bg-zinc-900 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl p-8">
                        <h2 className="text-xl font-black uppercase text-blue-500 mb-8 border-b border-white/10 pb-4">Rotación de Creativos (Anuncios)</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {mediosData.filter(adset => ALLOWED_IDS.includes(adset.id)).map(adset => {
                                const ads = adset.ads?.data || [];
                                const adA = ads[0];
                                const adB = ads[1];
                                
                                return (
                                    <div key={adset.id} className="bg-black border border-white/10 p-6 rounded-3xl">
                                        <p className="text-xs font-black uppercase text-zinc-500 mb-4 truncate">{adset.name}</p>
                                        
                                        {ads.length >= 2 ? (
                                            <div className="space-y-4">
                                                {/* Ad A Display */}
                                                <div className={`p-4 rounded-xl border flex justify-between items-center transition-all ${adA.status === 'ACTIVE' ? 'bg-blue-600/10 border-blue-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                                                    <div className="flex items-center gap-2 overflow-hidden"><div className={`w-2 h-2 rounded-full ${adA.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-600'}`}/> <span className="text-[10px] font-bold truncate pr-2">{adA.name || 'Ad A'}</span></div>
                                                    <button onClick={() => toggleMedio(adA.id, adB.id)} className={`px-3 py-1 rounded-lg text-[9px] font-black ${adA.status !== 'ACTIVE' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{adA.status === 'ACTIVE' ? 'Activo' : 'Encender'}</button>
                                                </div>
                                                {/* Ad B Display */}
                                                <div className={`p-4 rounded-xl border flex justify-between items-center transition-all ${adB.status === 'ACTIVE' ? 'bg-blue-600/10 border-blue-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                                                    <div className="flex items-center gap-2 overflow-hidden"><div className={`w-2 h-2 rounded-full ${adB.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-600'}`}/> <span className="text-[10px] font-bold truncate pr-2">{adB.name || 'Ad B'}</span></div>
                                                    <button onClick={() => toggleMedio(adB.id, adA.id)} className={`px-3 py-1 rounded-lg text-[9px] font-black ${adB.status !== 'ACTIVE' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{adB.status === 'ACTIVE' ? 'Activo' : 'Encender'}</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-rose-500 text-[10px] font-bold">Requiere al menos 2 Anuncios para rotación.</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- PANTALLA DE LOGIN ---
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
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: selected, password: pass })
            });
            if (res.ok) {
                const user = await res.json();
                localStorage.setItem('session_user', user.user);
                onLogin(user.user);
            } else alert("Contraseña incorrecta");
        } catch (e) { alert("Error de servidor"); }
        finally { setLoading(false); }
    };
    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 font-sans italic">
            <div className="w-full max-w-sm bg-zinc-900 p-12 rounded-[3.5rem] border border-white/5 text-center shadow-2xl">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-lg shadow-blue-500/20">
                    <Icon name="ShieldCheck" size={40} className="text-white" />
                </div>
                <h1 className="text-2xl font-black italic uppercase text-white mb-10">Meta Control</h1>
                <form onSubmit={handleLogin} className="space-y-6 text-left">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase ml-2 tracking-widest">Auditor</label>
                        <select className="w-full bg-black border border-white/10 rounded-2xl p-5 text-white outline-none appearance-none cursor-pointer" value={selected} onChange={e => setSelected(e.target.value)}>
                            {auditors.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase ml-2 tracking-widest">Contraseña</label>
                        <input type="password" placeholder="••••" required className="w-full bg-black border border-white/10 rounded-2xl p-5 text-white outline-none focus:border-blue-600" onChange={e => setPass(e.target.value)} />
                    </div>
                    <button className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase text-white shadow-xl hover:bg-blue-500 transition-all">{loading ? "Cargando..." : "Entrar"}</button>
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