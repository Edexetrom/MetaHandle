// Nota: En este entorno usamos los globales de React y Lucide inyectados por el index.html
const { useState, useEffect, useCallback, useMemo } = React;

/** * --- COMPONENTE: AD CARD ---
 * Representa un anuncio o grupo con diseño premium
 */
const AdCard = ({ item, isSelected, onSelect }) => {
    const { Power, DollarSign, TrendingUp, CheckCircle2, Layers, Target } = window.lucide;

    const spend = item.insights?.data?.[0]?.spend || 0;
    const results = item.insights?.data?.[0]?.actions?.[0]?.value || 0;

    return (
        <div
            onClick={() => onSelect(item.id)}
            className={`group relative p-6 rounded-[2rem] cursor-pointer transition-all duration-300 border ${isSelected
                    ? 'border-blue-500 bg-blue-500/10 scale-[0.98] shadow-2xl shadow-blue-900/20'
                    : 'border-white/5 bg-[#0a0a0a] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
        >
            <div className="flex justify-between items-start mb-6">
                <div className="max-w-[70%]">
                    <div className="flex items-center gap-2 mb-1">
                        {item.adset_id ? <Target size={10} className="text-slate-500" /> : <Layers size={10} className="text-slate-500" />}
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            {item.adset_id ? 'Anuncio' : 'Conjunto'}
                        </span>
                    </div>
                    <h3 className="font-bold text-sm truncate uppercase text-white tracking-tight" title={item.name}>
                        {item.name}
                    </h3>
                    <p className="text-[10px] text-slate-600 font-mono mt-1">ID: {item.id}</p>
                </div>

                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest ${item.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                    {item.status}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 group-hover:border-white/10 transition-colors">
                    <p className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                        <DollarSign size={8} /> Gasto Hoy
                    </p>
                    <p className="text-lg font-bold text-white">${Number(spend).toFixed(2)}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 group-hover:border-white/10 transition-colors">
                    <p className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                        <TrendingUp size={8} /> Resultados
                    </p>
                    <p className="text-lg font-bold text-blue-500">{results}</p>
                </div>
            </div>

            {isSelected && (
                <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full p-1.5 shadow-2xl border-4 border-[#020202] animate-in zoom-in">
                    <CheckCircle2 size={16} />
                </div>
            )}
        </div>
    );
};

/**
 * --- COMPONENTE: HEADER ---
 * Acciones globales y Branding
 */
const AppHeader = ({ selectedCount, onAction, onRefresh, loading, apiUrl }) => {
    const { Power, RefreshCw, Activity } = window.lucide;

    return (
        <header className="flex flex-col lg:flex-row justify-between items-center bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] mb-10 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-5 mb-6 lg:mb-0">
                <div className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-900/40">
                    <Activity className="text-white" size={28} />
                </div>
                <div>
                    <h1 className="text-2xl font-black uppercase italic text-white tracking-tighter">Meta Enterprise</h1>
                    <p className="text-[10px] text-blue-500 font-mono tracking-widest uppercase">Node: {apiUrl}</p>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
                <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/5 mr-2">
                    <span className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Seleccionados: {selectedCount}</span>
                </div>
                <button
                    onClick={() => onAction('ACTIVE')}
                    disabled={selectedCount === 0 || loading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 px-8 py-3 rounded-2xl text-xs font-black transition-all shadow-lg active:scale-95"
                >
                    <Power size={14} /> ENCENDER
                </button>
                <button
                    onClick={() => onAction('PAUSED')}
                    disabled={selectedCount === 0 || loading}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-20 px-8 py-3 rounded-2xl text-xs font-black transition-all shadow-lg active:scale-95"
                >
                    <Power size={14} /> APAGAR
                </button>
                <button onClick={onRefresh} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-colors">
                    <RefreshCw size={22} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>
        </header>
    );
};

/**
 * --- COMPONENTE PRINCIPAL: APP ---
 * Gestión de estado y orquestación
 */
const App = () => {
    const [data, setData] = useState({ ad_sets: [], ads: [] });
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState([]);
    const [mode, setMode] = useState('adsets');
    const [date, setDate] = useState('');
    const [error, setError] = useState(null);

    const API_URL = "https://manejoapi.libresdeumas.com";
    const { Clock, AlertTriangle, Search, Filter } = window.lucide;

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/ads/dashboard`);
            if (!res.ok) throw new Error(`Error de conexión (${res.status})`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleToggle = (id) => {
        setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleAction = async (status) => {
        setLoading(true);
        try {
            await fetch(`${API_URL}/ads/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_ids: selected, status })
            });
            await fetchData();
            setSelected([]);
        } catch (err) {
            setError("Fallo al actualizar en Meta.");
        } finally {
            setLoading(false);
        }
    };

    const currentItems = mode === 'adsets' ? data.ad_sets : data.ads;

    return (
        <div className="min-h-screen bg-[#020202] text-slate-100 p-6 md:p-12">
            <AppHeader
                selectedCount={selected.length}
                onAction={handleAction}
                onRefresh={fetchData}
                loading={loading}
                apiUrl={API_URL}
            />

            {error && (
                <div className="mb-10 bg-rose-500/10 border border-rose-500/20 p-6 rounded-3xl flex items-center gap-4 text-rose-400 animate-in slide-in-from-top">
                    <AlertTriangle size={24} />
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest">Atención Requerida</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
                {/* Sidebar: Programación y Filtros */}
                <aside className="space-y-6">
                    <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-xl">
                        <h2 className="text-[10px] font-black text-blue-500 uppercase mb-6 tracking-widest flex items-center gap-2">
                            <Clock size={14} /> Scheduler Pro
                        </h2>
                        <div className="space-y-4">
                            <input
                                type="datetime-local"
                                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                                onChange={(e) => setDate(e.target.value)}
                            />
                            <button className="w-full bg-white/5 hover:bg-blue-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                                Programar Selección
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-600 italic mt-6 leading-relaxed">
                            * El sistema ejecutará el cambio automáticamente en la fecha indicada.
                        </p>
                    </div>

                    <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-xl">
                        <h2 className="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-widest flex items-center gap-2">
                            <Filter size={14} /> Filtros Rápidos
                        </h2>
                        <div className="flex flex-col gap-2">
                            <button className="text-left px-4 py-2 rounded-xl text-[10px] font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-all">Solo Activos</button>
                            <button className="text-left px-4 py-2 rounded-xl text-[10px] font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-all">Con Gasto {'>'} $0</button>
                            <button className="text-left px-4 py-2 rounded-xl text-[10px] font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-all">Sin Resultados</button>
                        </div>
                    </div>
                </aside>

                {/* Grid Principal */}
                <main className="xl:col-span-3">
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/5">
                            <button
                                onClick={() => { setMode('adsets'); setSelected([]); }}
                                className={`px-8 py-3 rounded-xl text-[10px] font-black transition-all ${mode === 'adsets' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                            >
                                CONJUNTOS
                            </button>
                            <button
                                onClick={() => { setMode('ads'); setSelected([]); }}
                                className={`px-8 py-3 rounded-xl text-[10px] font-black transition-all ${mode === 'ads' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                            >
                                ANUNCIOS
                            </button>
                        </div>

                        <div className="hidden md:flex items-center gap-3 bg-white/5 px-5 py-3 rounded-2xl border border-white/5 text-slate-500">
                            <Search size={16} />
                            <input type="text" placeholder="Buscar por nombre o ID..." className="bg-transparent outline-none text-xs w-48 font-medium" />
                        </div>
                    </div>

                    {loading && currentItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-40 opacity-20">
                            <RefreshCw size={48} className="animate-spin mb-4" />
                            <p className="font-black uppercase tracking-[0.3em] text-xs">Sincronizando con Meta...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 animate-in fade-in duration-500">
                            {currentItems.map(item => (
                                <AdCard
                                    key={item.id}
                                    item={item}
                                    isSelected={selected.includes(item.id)}
                                    onSelect={handleToggle}
                                />
                            ))}
                            {currentItems.length === 0 && (
                                <div className="col-span-full py-20 text-center glass rounded-[3rem] opacity-40">
                                    <p className="font-bold uppercase tracking-widest text-sm">No se encontraron activos</p>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;