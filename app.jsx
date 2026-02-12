import React, { useState, useEffect } from 'react';
import {
    Power,
    Clock,
    LayoutGrid,
    RefreshCw,
    TrendingUp,
    DollarSign,
    Layers,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';

const App = () => {
    const [data, setData] = useState({ ad_sets: [], ads: [] });
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [filterType, setFilterType] = useState('all'); // all, active, paused
    const [viewMode, setViewMode] = useState('adsets'); // adsets, ads

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:8000/ads/dashboard');
            const result = await response.json();
            setData(result);
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Polling cada 30s
        return () => clearInterval(interval);
    }, []);

    const handleToggleStatus = async (status) => {
        if (selectedIds.length === 0) return;

        try {
            const response = await fetch('http://localhost:8000/ads/toggle-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_ids: selectedIds, status })
            });
            if (response.ok) {
                fetchData();
                setSelectedIds([]);
            }
        } catch (error) {
            console.error("Error toggling status", error);
        }
    };

    const toggleSelection = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const getMetric = (item, type) => {
        const insights = item.insights?.data?.[0];
        if (!insights) return 0;
        if (type === 'spend') return parseFloat(insights.spend).toFixed(2);
        if (type === 'results') return insights.actions?.find(a => a.action_type === 'results')?.value || 0;
        return 0;
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Layers className="text-blue-500" /> Meta Ads Controller
                    </h1>
                    <p className="text-slate-400 text-sm">Control centralizado de campañas en tiempo real</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => handleToggleStatus('ACTIVE')}
                        disabled={selectedIds.length === 0}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 px-4 py-2 rounded-lg font-medium transition-all"
                    >
                        <Power size={18} /> Encender Seleccionados
                    </button>
                    <button
                        onClick={() => handleToggleStatus('PAUSED')}
                        disabled={selectedIds.length === 0}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 px-4 py-2 rounded-lg font-medium transition-all"
                    >
                        <Power size={18} /> Apagar Seleccionados
                    </button>
                    <button onClick={fetchData} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Tabs & Filters */}
            <div className="flex gap-4 mb-6">
                <button
                    onClick={() => setViewMode('adsets')}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${viewMode === 'adsets' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}
                >
                    Grupos (AdSets)
                </button>
                <button
                    onClick={() => setViewMode('ads')}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${viewMode === 'ads' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}
                >
                    Anuncios (Ads)
                </button>
            </div>

            {/* Grid Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(viewMode === 'adsets' ? data.ad_sets : data.ads).map((item) => (
                    <div
                        key={item.id}
                        onClick={() => toggleSelection(item.id)}
                        className={`relative p-5 rounded-2xl border transition-all cursor-pointer group ${selectedIds.includes(item.id)
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="max-w-[80%]">
                                <h3 className="font-bold truncate text-lg group-hover:text-blue-400 transition-colors">{item.name}</h3>
                                <p className="text-xs text-slate-500 font-mono mt-1 uppercase">ID: {item.id}</p>
                            </div>
                            <div className={`px-2 py-1 rounded text-[10px] font-bold ${item.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                }`}>
                                {item.status}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="bg-slate-800/50 p-3 rounded-xl">
                                <p className="text-slate-400 text-[10px] flex items-center gap-1 uppercase tracking-wider mb-1">
                                    <DollarSign size={10} /> Inversión
                                </p>
                                <p className="font-bold text-lg">${getMetric(item, 'spend')}</p>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-xl">
                                <p className="text-slate-400 text-[10px] flex items-center gap-1 uppercase tracking-wider mb-1">
                                    <TrendingUp size={10} /> Resultados
                                </p>
                                <p className="font-bold text-lg">{getMetric(item, 'results')}</p>
                            </div>
                        </div>

                        {item.daily_budget && (
                            <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                                <span className="text-xs text-slate-400 italic">Ppto. Diario</span>
                                <span className="font-semibold text-emerald-500">${(parseFloat(item.daily_budget) / 100).toFixed(2)}</span>
                            </div>
                        )}

                        {selectedIds.includes(item.id) && (
                            <div className="absolute -top-2 -right-2 bg-blue-500 rounded-full p-1 shadow-lg ring-4 ring-slate-950">
                                <CheckCircle2 size={16} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {loading && data.ads.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64">
                    <RefreshCw size={48} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-slate-400">Sincronizando con Meta...</p>
                </div>
            )}
        </div>
    );
};

export default App;