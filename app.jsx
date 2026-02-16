// Nota: Usamos los globales React y lucide inyectados por el index.html
const { useState, useEffect, useCallback } = React;

/**
 * --- COMPONENTE: HELPER DE ICONOS ---
 * Soluciona el Error #130 transformando Lucide CDN en componentes de React
 */
const Icon = ({ name, size = 16, className = "" }) => {
    const iconRef = React.useRef(null);

    useEffect(() => {
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons({
                icons: {
                    [name]: window.lucide[name]
                },
                attrs: {
                    'stroke-width': 2,
                    'width': size,
                    'height': size,
                    'class': className
                }
            });
        }
    }, [name, size, className]);

    return <i data-lucide={name} ref={iconRef} className={className} style={{ display: 'inline-block', width: size, height: size }}></i>;
};

/**
 * --- COMPONENTE: TARJETA DE ADSET/AD ---
 */
const AdCard = ({ item, isSelected, onSelect }) => {
    const spend = item.insights?.data?.[0]?.spend || 0;
    const results = item.insights?.data?.[0]?.actions?.[0]?.value || 0;

    return (
        <div
            onClick={() => onSelect(item.id)}
            className={`group relative p-6 rounded-[2rem] cursor-pointer transition-all duration-300 border ${isSelected
                    ? 'border-blue-500 bg-blue-500/10 scale-[0.98] shadow-2xl'
                    : 'border-white/5 bg-[#0a0a0a] hover:border-white/20'
                }`}
        >
            <div className="flex justify-between items-start mb-6">
                <div className="max-w-[70%]">
                    <div className="flex items-center gap-2 mb-1">
                        <Icon name={item.adset_id ? "Target" : "Layers"} size={12} className="text-slate-500" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            {item.adset_id ? 'Anuncio' : 'Conjunto'}
                        </span>
                    </div>
                    <h3 className="font-bold text-sm truncate uppercase text-white tracking-tight" title={item.name}>
                        {item.name}
                    </h3>
                    <p className="text-[10px] text-slate-600 font-mono mt-1">ID: {item.id}</p>
                </div>

                <div className={`px-3 py-1 rounded-full border text-[9px] font-black tracking-widest ${item.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    }`}>
                    {item.status}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                        <Icon name="DollarSign" size={10} /> Gasto Hoy
                    </p>
                    <p className="text-lg font-bold text-white">${Number(spend).toFixed(2)}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                        <Icon name="TrendingUp" size={10} /> Resultados
                    </p>
                    <p className="text-lg font-bold text-blue-500">{results}</p>
                </div>
            </div>

            {isSelected && (
                <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full p-1.5 shadow-2xl border-4 border-[#020202]">
                    <Icon name="CheckCircle2" size={16} />
                </div>
            )}
        </div>
    );
};

/**
 * --- COMPONENTE PRINCIPAL: APP ---
 */
const App = () => {
    const [data, setData] = useState({ ad_sets: [], ads: [] });
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState([]);
    const [mode, setMode] = useState('adsets');
    const [error, setError] = useState(null);

    const API_URL = "https://manejoapi.libresdeumas.com";

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/ads/dashboard`);
            if (!res.ok) throw new Error(`Error ${res.status}: API no disponible`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
    }, [fetchData]);

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
            setError("Error al actualizar Meta.");
        } finally {
            setLoading(false);
        }
    };

    const currentItems = mode === 'adsets' ? data.ad_sets : data.ads;

    return (
        <div className="min-h-screen bg-[#020202] text-slate-100 p-6 md:p-12">
            <header className="flex flex-col lg:flex-row justify-between items-center bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] mb-10 shadow-2xl">
                <div className="flex items-center gap-5">
                    <div className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-900/40">
                        <Icon name="Activity" size={28} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase italic text-white tracking-tighter">Meta Enterprise</h1>
                        <p className="text-[10px] text-blue-500 font-mono tracking-widest uppercase">API: {API_URL}</p>
                    </div>
                </div>

                <div className="flex gap-4 mt-6 lg:mt-0">
                    <button
                        onClick={() => handleAction('ACTIVE')}
                        disabled={selected.length === 0 || loading}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 px-8 py-3 rounded-2xl text-xs font-black transition-all"
                    >
                        <Icon name="Power" size={14} /> ON
                    </button>
                    <button
                        onClick={() => handleAction('PAUSED')}
                        disabled={selected.length === 0 || loading}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-20 px-8 py-3 rounded-2xl text-xs font-black transition-all"
                    >
                        <Icon name="Power" size={14} /> OFF
                    </button>
                    <button onClick={fetchData} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-colors">
                        <Icon name="RefreshCw" size={22} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-10 bg-rose-500/10 border border-rose-500/20 p-6 rounded-3xl flex items-center gap-4 text-rose-400">
                    <Icon name="AlertTriangle" size={24} />
                    <p className="text-sm font-bold uppercase">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
                <aside className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] h-fit">
                    <h2 className="text-[10px] font-black text-blue-500 uppercase mb-6 tracking-widest flex items-center gap-2">
                        <Icon name="Clock" size={14} /> Programador
                    </h2>
                    <input type="datetime-local" className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm text-white mb-6 outline-none focus:border-blue-500" />
                    <button className="w-full bg-white/5 hover:bg-blue-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                        Programar
                    </button>
                </aside>

                <main className="xl:col-span-3">
                    <div className="flex gap-4 mb-8 bg-white/5 p-2 rounded-2xl inline-flex border border-white/5">
                        <button onClick={() => setMode('adsets')} className={`px-10 py-3 rounded-xl text-xs font-black transition-all ${mode === 'adsets' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>CONJUNTOS</button>
                        <button onClick={() => setMode('ads')} className={`px-10 py-3 rounded-xl text-xs font-black transition-all ${mode === 'ads' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>ANUNCIOS</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                        {currentItems.map(item => (
                            <AdCard
                                key={item.id}
                                item={item}
                                isSelected={selected.includes(item.id)}
                                onSelect={handleToggle}
                            />
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
};

// Renderizado final para React 18 Standalone
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);