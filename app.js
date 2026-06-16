/**
 * SISTEMA: Control Meta Pro v3.2 (Cyber-Dark Solid Dashboard)
 * CARACTERÍSTICAS:
 * - Estética Premium Minimalista de Contraste Sólido (No Glassmorphism).
 * - Paneles oscuros con bordes definidos (zinc-800) y fondo negro absoluto.
 * - Barra de progreso visual para el gasto de presupuesto diario (Stop-Loss).
 * - Buscador integrado y filtros de estado para campañas.
 * - Función robusta de lectura de conversaciones por mensaje.
 * - Control directo de pujas (Bid) y estados manuales con guardado dinámico.
 * - Panel unificado de Horarios y Fechas de Festivos (Blackouts).
 * - Preparado para Dokploy de Hostinger y entornos locales de desarrollo.
 */
const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback
} = React;

// --- CONFIGURACIÓN DE ENDPOINT ---
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://localhost:8000" : window.location.hostname.includes("libresdeumas.com") ? "http://manejoapi.libresdeumas.com:8000" : window.location.origin;
const ALLOWED_IDS = ["120238886501840717", "120238886472900717", "120238886429400717", "120238886420220717", "120238886413960717", "120238886369210717", "120234721717970717", "120234721717960717", "120234721717950717", "120233618279570717", "120233618279540717", "120233611687810717", "120232204774610717", "120232204774590717", "120232204774570717", "120232157515490717", "120232157515480717", "120232157515460717"];

// --- COMPONENTE: ICONOS (LUCIDE) ---
const Icon = ({
  name,
  size = 16,
  className = "",
  spin = false
}) => {
  const iconRef = useRef(null);
  useEffect(() => {
    if (window.lucide && iconRef.current) {
      iconRef.current.innerHTML = `<i data-lucide="${name}"></i>`;
      window.lucide.createIcons({
        attrs: {
          'stroke-width': 2.5,
          'width': size,
          'height': size,
          'class': `${className} ${spin ? 'animate-spin' : ''}`.trim()
        },
        nameAttr: 'data-lucide',
        root: iconRef.current
      });
    }
  }, [name, size, className, spin]);
  return /*#__PURE__*/React.createElement("span", {
    ref: iconRef,
    className: "inline-flex items-center justify-center pointer-events-none",
    style: {
      width: size,
      height: size
    }
  });
};

// --- COMPONENTE: INPUT OPTIMIZADO CON ESTADO DE GUARDADO ---
const FluidInput = ({
  value,
  onSave,
  className,
  type = "number",
  step = "1",
  placeholder = "",
  suffix = ""
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (!isEditing) setLocalValue(value);
  }, [value, isEditing]);
  const handleBlur = async () => {
    setIsEditing(false);
    if (localValue !== value) {
      setIsSaving(true);
      try {
        await onSave(type === "number" ? parseFloat(localValue) : localValue);
      } catch (e) {
        console.error("Error al guardar input:", e);
      }
      setIsSaving(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "relative flex items-center justify-center w-full"
  }, /*#__PURE__*/React.createElement("input", {
    type: type,
    step: step,
    className: `${className} transition-all duration-200 pr-6 ${isSaving ? 'border-amber-500/50 text-amber-500 bg-amber-500/10' : isEditing ? 'border-blue-500 bg-zinc-900 ring-2 ring-blue-500/10' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'}`,
    placeholder: placeholder,
    value: localValue === null || localValue === undefined ? "" : localValue,
    onFocus: () => setIsEditing(true),
    onChange: e => setLocalValue(e.target.value),
    onBlur: handleBlur,
    onKeyDown: e => e.key === 'Enter' && handleBlur(),
    disabled: isSaving
  }), suffix && !isSaving && /*#__PURE__*/React.createElement("span", {
    className: "absolute right-2.5 text-[10px] font-bold text-zinc-550 pointer-events-none uppercase"
  }, suffix), isSaving && /*#__PURE__*/React.createElement("span", {
    className: "absolute right-2 text-[9px] text-amber-500 animate-pulse pointer-events-none"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Loader2",
    size: 10,
    spin: true
  })));
};

// --- COMPONENTE: SELECTOR DE TURNOS MÚLTIPLES ---
const TurnSelector = ({
  currentTurnos,
  availableTurns,
  onUpdate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const activeList = useMemo(() => currentTurnos ? currentTurnos.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [], [currentTurnos]);
  useEffect(() => {
    const handleClickOutside = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const toggleTurno = name => {
    const lowerName = name.toLowerCase();
    const newList = activeList.includes(lowerName) ? activeList.filter(t => t !== lowerName) : [...activeList, lowerName];
    onUpdate(newList.join(', '));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "relative",
    ref: containerRef
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsOpen(!isOpen),
    className: "bg-zinc-950 border border-zinc-800 p-2 rounded text-[10px] font-bold uppercase text-zinc-300 w-36 flex justify-between items-center hover:bg-zinc-900 hover:border-zinc-700 transition-all shadow-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "truncate"
  }, activeList.length > 0 ? activeList.join(', ') : 'Sin Horarios'), /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronDown",
    size: 11,
    className: "text-zinc-500"
  })), isOpen && /*#__PURE__*/React.createElement("div", {
    className: "absolute right-0 z-50 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl p-2 animate-fade-in"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-bold text-zinc-550 uppercase p-2 border-b border-zinc-800 mb-1.5 text-center"
  }, "Configurar Turnos"), /*#__PURE__*/React.createElement("div", {
    className: "max-h-48 overflow-y-auto custom-scrollbar"
  }, Object.keys(availableTurns).length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-600 text-center py-3 italic"
  }, "No hay horarios") : Object.keys(availableTurns).map(name => /*#__PURE__*/React.createElement("div", {
    key: name,
    onClick: () => toggleTurno(name),
    className: "flex items-center gap-3 p-2 hover:bg-zinc-850 rounded cursor-pointer transition-all"
  }, /*#__PURE__*/React.createElement("div", {
    className: `w-4 h-4 rounded border flex items-center justify-center transition-all ${activeList.includes(name.toLowerCase()) ? 'bg-blue-600 border-blue-500 text-white' : 'border-zinc-700 bg-zinc-950'}`
  }, activeList.includes(name.toLowerCase()) && /*#__PURE__*/React.createElement(Icon, {
    name: "Check",
    size: 10
  })), /*#__PURE__*/React.createElement("span", {
    className: `text-[10px] font-bold uppercase ${activeList.includes(name.toLowerCase()) ? 'text-white' : 'text-zinc-500'}`
  }, name))))));
};

// --- COMPONENTE: SELECTOR DE DÍAS ACTIVOS ---
const DaySelector = ({
  value,
  onUpdate
}) => {
  const daysMap = [{
    key: 'L',
    label: 'L'
  }, {
    key: 'M',
    label: 'M'
  }, {
    key: 'X',
    label: 'M'
  }, {
    key: 'J',
    label: 'J'
  }, {
    key: 'V',
    label: 'V'
  }, {
    key: 'S',
    label: 'S'
  }, {
    key: 'D',
    label: 'D'
  }];
  const activeDays = useMemo(() => {
    if (!value) return [];
    if (value === "L-V") return ['L', 'M', 'X', 'J', 'V'];
    if (value === "S") return ['S'];
    return value.split(',').map(d => d.trim().toUpperCase());
  }, [value]);
  const toggleDay = key => {
    let newDays = [...activeDays];
    if (newDays.includes(key)) {
      newDays = newDays.filter(k => k !== key);
    } else {
      newDays.push(key);
    }
    newDays.sort((a, b) => daysMap.findIndex(d => d.key === a) - daysMap.findIndex(d => d.key === b));
    onUpdate(newDays.join(','));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1 justify-center"
  }, daysMap.map(d => /*#__PURE__*/React.createElement("button", {
    key: d.key,
    onClick: () => toggleDay(d.key),
    className: `w-7 h-7 rounded text-[10px] font-bold transition-all flex items-center justify-center ${activeDays.includes(d.key) ? 'bg-blue-600 text-white border border-blue-500' : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'}`
  }, d.label)));
};

// --- AUXILIAR: TIEMPO HORA A FLOTANTE Y VICEVERSA ---
const floatToTime = val => {
  const v = parseFloat(val) || 0;
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};
const timeToFloat = val => {
  if (!val) return 0;
  const [h, m] = val.toString().split(':');
  return parseInt(h || 0) + parseInt(m || 0) / 60;
};

// --- EXTRAER CONVERSACIONES DE MENSAJES DE LAS ACCIONES ---
const getMessagingConversations = actions => {
  if (!actions || !Array.isArray(actions)) return 0;
  const match = actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d' || a.action_type === 'onsite_conversion.messaging_first_reply' || a.action_type === 'messaging_first_replies' || a.action_type && (a.action_type.toLowerCase().includes('messaging') || a.action_type.toLowerCase().includes('message')));
  return match ? parseInt(match.value || 0, 10) : 0;
};

// --- APLICACIÓN PRINCIPAL ---
const Dashboard = ({
  userEmail,
  onLogout
}) => {
  const [data, setData] = useState({
    meta: [],
    settings: {},
    turns: {},
    holidays: [],
    automation_active: false,
    logs: []
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLimit, setBulkLimit] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState('panel'); // panel | turnos | medios
  const [newHoliday, setNewHoliday] = useState("");

  // Filtros de tabla
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | ACTIVE | PAUSED

  const fetchSync = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/ads/sync`);
      const json = await res.json();
      if (json) setData(json);
    } catch (e) {
      console.error("Sync Error", e);
    } finally {
      if (!silent) setSyncing(false);
    }
  }, []);
  useEffect(() => {
    fetchSync();
    const interval = setInterval(() => fetchSync(true), 25000);
    return () => clearInterval(interval);
  }, [fetchSync]);
  const handleBulkAction = async () => {
    if (!bulkLimit || !selectedIds.length) return;
    setSyncing(true);
    await fetch(`${API_URL}/ads/bulk-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ids: selectedIds,
        limit_perc: bulkLimit,
        user: userEmail
      })
    });
    setBulkLimit("");
    setSelectedIds([]);
    fetchSync(true);
  };
  const toggleMetaStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setData(prev => ({
      ...prev,
      meta: prev.meta.map(ad => ad.id === id ? {
        ...ad,
        status: nextStatus
      } : ad)
    }));
    await fetch(`${API_URL}/ads/meta-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id,
        status: nextStatus,
        user: userEmail
      })
    });
    fetchSync(true);
  };
  const updateSetting = async (id, key, val) => {
    setData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [id]: {
          ...prev.settings[id],
          [key]: val
        }
      }
    }));
    await fetch(`${API_URL}/ads/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id,
        [key]: val,
        user: userEmail
      })
    });
  };
  const updateBid = async (id, val) => {
    await fetch(`${API_URL}/ads/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id,
        bid_amount: val,
        user: userEmail
      })
    });
    fetchSync(true);
  };
  const toggleMediaAd = async (adsetId, targetAdId) => {
    setSyncing(true);
    await fetch(`${API_URL}/ads/medios/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        adset_id: adsetId,
        target_ad_id: targetAdId,
        user: userEmail
      })
    });
    fetchSync();
  };
  const sortedData = useMemo(() => [...data.meta].filter(ad => ALLOWED_IDS.includes(ad.id)).sort((a, b) => a.status === 'ACTIVE' ? -1 : 1), [data.meta]);
  const filteredData = useMemo(() => {
    return sortedData.filter(ad => {
      const matchesSearch = ad.name.toLowerCase().includes(searchQuery.toLowerCase()) || ad.id.includes(searchQuery);
      const matchesStatus = statusFilter === "ALL" || statusFilter === "ACTIVE" && ad.status === "ACTIVE" || statusFilter === "PAUSED" && ad.status !== "ACTIVE";
      return matchesSearch && matchesStatus;
    });
  }, [sortedData, searchQuery, statusFilter]);
  const stats = useMemo(() => sortedData.reduce((acc, ad) => {
    const i = ad.insights?.data?.[0] || {};
    acc.s += parseFloat(i.spend || 0);
    acc.r += getMessagingConversations(i.actions);
    if (ad.status === 'ACTIVE') acc.a++;
    return acc;
  }, {
    s: 0,
    r: 0,
    a: 0
  }), [sortedData]);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen text-zinc-200 p-4 lg:p-10 font-sans tracking-tight bg-zinc-950"
  }, /*#__PURE__*/React.createElement("header", {
    className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 animate-fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800 flex items-center justify-between shadow-sm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1"
  }, "Automatizaci\xF3n Global"), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-black uppercase tracking-tight flex items-center gap-2"
  }, data.automation_active ? 'Activa' : 'Apagada', data.automation_active && /*#__PURE__*/React.createElement("span", {
    className: "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: async () => {
      const res = await fetch(`${API_URL}/ads/automation/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user: userEmail
        })
      });
      const json = await res.json();
      setData(prev => ({
        ...prev,
        automation_active: json.is_active
      }));
    },
    className: `w-12 h-6 rounded-full p-0.5 transition-all duration-205 relative ${data.automation_active ? 'bg-blue-600' : 'bg-zinc-800'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `w-5 h-5 bg-white rounded-full transition-all duration-200 transform ${data.automation_active ? 'translate-x-6' : 'translate-x-0'}`
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1"
  }, "Inversi\xF3n Hoy / Campa\xF1as Activas"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black tracking-tight text-blue-400"
  }, "$", stats.s.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-semibold text-zinc-500 ml-2"
  }, "/ ", stats.a, " Activas"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1"
  }, "Conversiones Mensajes (Total)"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black tracking-tight text-emerald-400 flex items-center gap-2"
  }, stats.r, /*#__PURE__*/React.createElement(Icon, {
    name: "MessageSquare",
    size: 16,
    className: "text-emerald-500"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800 flex items-center justify-between shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "truncate pr-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5"
  }, "Auditor Activo"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-zinc-300 truncate font-mono"
  }, userEmail)), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    className: "p-2 bg-zinc-950 text-red-500 border border-zinc-850 hover:bg-red-650 hover:text-white rounded transition-all",
    title: "Cerrar sesi\xF3n"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "LogOut",
    size: 14
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-3 mb-6 bg-zinc-900 p-2 rounded-lg border border-zinc-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('panel'),
    className: `px-5 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'panel' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-850'}`
  }, "Panel de Control"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('turnos'),
    className: `px-5 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'turnos' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-850'}`
  }, "Horarios y Festivos"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('medios'),
    className: `px-5 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'medios' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-850'}`
  }, "Medios Creativos (A/B)")), /*#__PURE__*/React.createElement("button", {
    onClick: () => fetchSync(),
    disabled: syncing,
    className: "bg-zinc-950 border border-zinc-800 p-2 rounded hover:bg-zinc-850 disabled:opacity-50"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "RefreshCw",
    spin: syncing,
    size: 14,
    className: "text-blue-500"
  }))), view === 'panel' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6 animate-fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex flex-wrap items-center justify-between gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-3 flex-1 min-w-[280px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative flex-1 min-w-[200px]"
  }, /*#__PURE__*/React.createElement("span", {
    className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Search",
    size: 14
  })), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Buscar AdSet por nombre o ID...",
    className: "w-full bg-zinc-950 border border-zinc-800 pl-10 pr-4 py-2 rounded text-xs text-zinc-200 outline-none focus:border-zinc-700",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex bg-zinc-950 rounded border border-zinc-800 p-1"
  }, ['ALL', 'ACTIVE', 'PAUSED'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    onClick: () => setStatusFilter(f),
    className: `px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${statusFilter === f ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-350'}`
  }, f === 'ALL' ? 'Todos' : f === 'ACTIVE' ? 'Activos' : 'Pausados')))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 bg-zinc-950 p-2 px-3 rounded border border-zinc-800"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Zap",
    size: 13,
    className: "text-yellow-500"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-bold uppercase text-zinc-400 tracking-wider"
  }, "L\xEDmite Masivo (Stop %):"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "bg-zinc-900 w-16 p-1 text-center text-xs rounded border border-zinc-750 outline-none text-blue-400 font-bold",
    value: bulkLimit,
    onChange: e => setBulkLimit(e.target.value),
    placeholder: "0"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleBulkAction,
    disabled: !bulkLimit || !selectedIds.length,
    className: "bg-blue-600 disabled:opacity-40 text-[9px] font-bold px-3 py-1 rounded uppercase text-white hover:bg-blue-500 transition-colors"
  }, "Aplicar a ", selectedIds.length))), /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-sm pb-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-left border-collapse"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "bg-zinc-950 text-[9px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800"
  }, /*#__PURE__*/React.createElement("th", {
    className: "p-4 w-12 text-center border-r border-zinc-800"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    className: "accent-blue-600 w-4 h-4 cursor-pointer rounded",
    checked: selectedIds.length === filteredData.length && filteredData.length > 0,
    onChange: e => {
      if (e.target.checked) {
        setSelectedIds(filteredData.map(ad => ad.id));
      } else {
        setSelectedIds([]);
      }
    }
  })), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center border-r border-zinc-800"
  }, "Estado"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 min-w-[285px] border-r border-zinc-800"
  }, "Configuraci\xF3n del AdSet"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center border-r border-zinc-800"
  }, "Alertas"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center border-r border-zinc-800"
  }, "Gasto Hoy"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center text-blue-400 border-r border-zinc-800"
  }, "L\xEDmite Stop"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center border-r border-zinc-800"
  }, "Puja (Bid)"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center border-r border-zinc-800"
  }, "Conversiones"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-r border-zinc-800"
  }, "Horarios"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center"
  }, "Bloqueo"))), /*#__PURE__*/React.createElement("tbody", {
    className: "text-xs divide-y divide-zinc-800 bg-zinc-900/50"
  }, filteredData.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "10",
    className: "p-10 text-center text-zinc-500 italic"
  }, "No se encontraron campa\xF1as coincidentes.")) : filteredData.map(ad => {
    const s = data.settings[ad.id] || {
      turno: "",
      limit_perc: 0,
      is_frozen: false
    };
    const i = ad.insights?.data?.[0] || {};
    const budget = parseFloat(ad.daily_budget || 0) / 100;
    const spend = parseFloat(i.spend || 0);
    const perc = budget > 0 ? spend / budget * 100 : 0;
    const active = ad.status === 'ACTIVE';
    const totalConversions = getMessagingConversations(i.actions);

    // Lógica del color del progreso de presupuesto
    let progressColor = "bg-blue-600";
    let progressBg = "bg-blue-950/20";
    let progressText = "text-blue-400 border border-blue-900/30";
    if (perc >= s.limit_perc && s.limit_perc > 0) {
      progressColor = "bg-red-650";
      progressBg = "bg-red-950/30";
      progressText = "text-red-400 border border-red-900/30";
    } else if (perc >= s.limit_perc * 0.8 && s.limit_perc > 0) {
      progressColor = "bg-yellow-600";
      progressBg = "bg-yellow-950/30";
      progressText = "text-yellow-400 border border-yellow-900/30";
    }
    return /*#__PURE__*/React.createElement("tr", {
      key: ad.id,
      className: `transition-all hover:bg-zinc-850/35 ${s.is_frozen ? 'opacity-40 bg-zinc-950/40' : ''}`
    }, /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      className: "accent-blue-600 w-4 h-4 cursor-pointer rounded",
      checked: selectedIds.includes(ad.id),
      onChange: e => {
        if (e.target.checked) {
          setSelectedIds([...selectedIds, ad.id]);
        } else {
          setSelectedIds(selectedIds.filter(x => x !== ad.id));
        }
      }
    })), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col items-center justify-center gap-1.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: `w-3 h-3 rounded-full transition-all border ${active ? 'bg-emerald-500 border-emerald-400' : 'bg-zinc-800 border-zinc-750'}`
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => toggleMetaStatus(ad.id, ad.status),
      disabled: s.is_frozen,
      className: `px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${active ? 'bg-zinc-800 text-zinc-450 hover:text-red-400 hover:bg-red-950/20' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`
    }, active ? 'Apagar' : 'Encender'))), /*#__PURE__*/React.createElement("td", {
      className: "p-4 border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col gap-0.5 max-w-[320px]"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold uppercase text-[11px] leading-snug text-zinc-150"
    }, ad.name), /*#__PURE__*/React.createElement("span", {
      onClick: () => {
        navigator.clipboard.writeText(ad.id);
      },
      className: "text-[9px] text-zinc-550 font-mono cursor-pointer hover:text-blue-400 transition-colors flex items-center gap-1.5 w-max",
      title: "Copiar ID del AdSet"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "Copy",
      size: 9
    }), ad.id))), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center relative group border-r border-zinc-800"
    }, ad.issues_info && ad.issues_info.length > 0 ? /*#__PURE__*/React.createElement("div", {
      className: "inline-block"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "AlertTriangle",
      size: 15,
      className: "text-yellow-500 mx-auto cursor-pointer"
    }), /*#__PURE__*/React.createElement("div", {
      className: "absolute z-50 bottom-full mb-2 hidden group-hover:block w-48 bg-zinc-950 border border-zinc-800 text-zinc-300 text-[9px] p-2.5 rounded shadow-2xl left-1/2 transform -translate-x-1/2"
    }, /*#__PURE__*/React.createElement("p", {
      className: "font-bold text-yellow-500 mb-0.5"
    }, "Alerta de Meta:"), ad.issues_info.map((err, idx) => /*#__PURE__*/React.createElement("p", {
      key: idx,
      className: "leading-normal"
    }, err.error_message || err)))) : /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-700"
    }, "-")), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col gap-1 items-center w-36 mx-auto"
    }, /*#__PURE__*/React.createElement("div", {
      className: `px-2 py-0.5 rounded font-bold text-[9px] tracking-tight ${progressBg} ${progressText}`
    }, "$", spend.toFixed(2), " (", perc.toFixed(0), "%)"), /*#__PURE__*/React.createElement("div", {
      className: "w-full bg-zinc-950 h-1.5 rounded overflow-hidden border border-zinc-800 p-[1px]"
    }, /*#__PURE__*/React.createElement("div", {
      className: `h-full rounded transition-all duration-500 ${progressColor}`,
      style: {
        width: `${Math.min(perc, 100)}%`
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] text-zinc-550 font-medium uppercase"
    }, "Ppto: $", budget.toFixed(2)))), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement(FluidInput, {
      value: s.limit_perc,
      suffix: "%",
      className: "bg-zinc-950 border border-zinc-800 w-16 p-1.5 rounded text-center text-blue-400 font-bold outline-none text-xs",
      onSave: val => updateSetting(ad.id, 'limit_perc', val),
      disabled: s.is_frozen
    })), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement(FluidInput, {
      value: ad.bid_amount ? ad.bid_amount / 100 : 0,
      step: "0.01",
      className: "bg-zinc-950 border border-zinc-800 w-20 p-1.5 rounded text-center text-emerald-400 font-bold outline-none font-mono text-xs",
      onSave: val => updateBid(ad.id, Math.round(val * 100)),
      disabled: s.is_frozen
    })), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-center gap-1 font-bold"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-100 text-sm tracking-tight"
    }, totalConversions), /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-500 text-[10px]"
    }, "msg"))), /*#__PURE__*/React.createElement("td", {
      className: "p-4 border-r border-zinc-800"
    }, /*#__PURE__*/React.createElement(TurnSelector, {
      currentTurnos: s.turno,
      availableTurns: data.turns,
      onUpdate: val => updateSetting(ad.id, 'turno', val)
    })), /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-center"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => updateSetting(ad.id, 'is_frozen', !s.is_frozen),
      className: `p-2 rounded border transition-all duration-200 ${s.is_frozen ? 'bg-blue-905/20 border-blue-800/40 text-blue-400 shadow-inner' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850'}`,
      title: s.is_frozen ? "Desbloquear" : "Bloquear"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: s.is_frozen ? "Lock" : "Unlock",
      size: 13
    }))));
  })))))), view === 'turnos' && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-900 p-8 rounded-lg border border-zinc-800 flex flex-col h-full shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3.5 mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "CalendarOff",
    className: "text-rose-405",
    size: 18
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-md font-bold uppercase text-zinc-100 tracking-tight"
  }, "Fechas Festivas"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-500 uppercase mt-0.5 font-semibold"
  }, "D\xEDas sin ejecuci\xF3n del bot"))), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-400 mb-5 leading-normal uppercase"
  }, "Agregue fechas espec\xEDficas donde la automatizaci\xF3n general se mantendr\xE1 en pausa durante todo el d\xEDa."), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2.5 mb-6"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: "flex-1 bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs text-white font-bold outline-none [color-scheme:dark]",
    value: newHoliday,
    onChange: e => setNewHoliday(e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    onClick: async () => {
      if (!newHoliday) return;
      await fetch(`${API_URL}/holidays/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: newHoliday
        })
      });
      setNewHoliday("");
      fetchSync(true);
    },
    className: "bg-rose-650 hover:bg-rose-600 text-white px-4 rounded-lg font-bold transition-all flex items-center justify-center border border-rose-600/30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus",
    size: 15
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 max-h-80 overflow-y-auto custom-scrollbar flex-1 pr-1"
  }, data.holidays && data.holidays.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-650 text-center italic py-5 uppercase"
  }, "No hay fechas festivas") : data.holidays.map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    className: "flex justify-between items-center bg-zinc-950 p-3 rounded-lg border border-zinc-800"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] font-bold font-mono text-zinc-300"
  }, d), /*#__PURE__*/React.createElement("button", {
    onClick: async () => {
      await fetch(`${API_URL}/holidays/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: d
        })
      });
      fetchSync(true);
    },
    className: "text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-all",
    title: "Eliminar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X",
    size: 13
  })))))), Object.entries(data.turns).map(([name, config]) => /*#__PURE__*/React.createElement("div", {
    key: name,
    className: "bg-zinc-900 p-8 rounded-lg border border-zinc-800 shadow-md flex flex-col justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start mb-6 border-b border-zinc-805 pb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Clock",
    className: "text-blue-450",
    size: 18
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-md font-bold uppercase text-zinc-100 tracking-tight"
  }, name), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-zinc-500 uppercase mt-0.5"
  }, "Bloque de horario"))), !["matutino", "especial", "vespertino", "nocturno", "fsemana"].includes(name.toLowerCase()) && /*#__PURE__*/React.createElement("button", {
    onClick: async () => {
      if (confirm(`¿Estás seguro de eliminar el horario "${name}"?`)) {
        await fetch(`${API_URL}/turns/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name
          })
        });
        fetchSync(true);
      }
    },
    className: "text-red-400 hover:text-white bg-red-950/20 hover:bg-red-650 p-2 rounded border border-red-900/20 transition-all",
    title: "Eliminar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trash2",
    size: 13
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 font-sans"
  }, "Hora de Inicio (24h)"), /*#__PURE__*/React.createElement(FluidInput, {
    type: "time",
    value: floatToTime(config.start),
    className: "w-full bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-xs text-white font-bold outline-none [color-scheme:dark]",
    onSave: async val => {
      await fetch(`${API_URL}/turns/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          start: timeToFloat(val),
          end: config.end,
          days: config.days
        })
      });
      fetchSync(true);
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 font-sans"
  }, "Hora de Fin (24h)"), /*#__PURE__*/React.createElement(FluidInput, {
    type: "time",
    value: floatToTime(config.end),
    className: "w-full bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-xs text-white font-bold outline-none [color-scheme:dark]",
    onSave: async val => {
      await fetch(`${API_URL}/turns/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          start: config.start,
          end: timeToFloat(val),
          days: config.days
        })
      });
      fetchSync(true);
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 font-sans"
  }, "D\xEDas Activos"), /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg"
  }, /*#__PURE__*/React.createElement(DaySelector, {
    value: config.days,
    onUpdate: async val => {
      await fetch(`${API_URL}/turns/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          start: config.start,
          end: config.end,
          days: val
        })
      });
      fetchSync(true);
    }
  }))))))), /*#__PURE__*/React.createElement("div", {
    onClick: async () => {
      const name = prompt("Ingrese el nombre del nuevo horario personalizado (ej. madrugada):");
      if (name && name.trim()) {
        await fetch(`${API_URL}/turns/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: name.trim(),
            start: 0,
            end: 12,
            days: "L,M,X,J,V"
          })
        });
        fetchSync(true);
      }
    },
    className: "bg-zinc-950 hover:bg-zinc-900 transition-all rounded-lg border border-zinc-800 border-dashed p-10 flex flex-col justify-center items-center shadow-sm h-full min-h-[300px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-blue-650/10 p-4 rounded-full mb-4 border border-blue-500/15"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus",
    className: "text-blue-400",
    size: 20
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-sm font-bold uppercase text-blue-450 tracking-wider"
  }, "Crear Nuevo Horario"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-550 uppercase mt-2 text-center leading-normal font-semibold"
  }, "A\xF1ade un bloque de encendido ", /*#__PURE__*/React.createElement("br", null), " personalizado."))), view === 'medios' && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in"
  }, sortedData.map(ad => /*#__PURE__*/React.createElement("div", {
    key: ad.id,
    className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800 shadow-sm flex flex-col justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start border-b border-zinc-800 pb-4 mb-4"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xs font-bold uppercase text-blue-400 tracking-tight max-w-[200px] truncate",
    title: ad.name
  }, ad.name), /*#__PURE__*/React.createElement("span", {
    className: "text-[8px] font-mono text-zinc-500 uppercase mt-0.5"
  }, ad.id)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-zinc-500 uppercase font-bold mb-2"
  }, "Video Activo en Rotaci\xF3n"), ad.ads && ad.ads.data && ad.ads.data.length > 0 ? ad.ads.data.map((anuncio, idx) => {
    const isAdActive = anuncio.status === 'ACTIVE';
    return /*#__PURE__*/React.createElement("div", {
      key: anuncio.id,
      className: `p-3 rounded-lg border transition-all flex items-center justify-between ${isAdActive ? 'bg-blue-900/15 border-blue-800/40 text-blue-300 shadow-inner' : 'bg-zinc-950 border-zinc-800'}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: `w-8 h-8 rounded flex items-center justify-center font-bold text-[10px] ${isAdActive ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-550'}`
    }, "V", idx + 1), /*#__PURE__*/React.createElement("div", {
      className: "max-w-[120px]"
    }, /*#__PURE__*/React.createElement("p", {
      className: `text-[9px] font-bold uppercase ${isAdActive ? 'text-blue-400' : 'text-zinc-500'}`
    }, "Anuncio ", idx + 1), /*#__PURE__*/React.createElement("p", {
      className: "text-[8px] text-zinc-500 truncate",
      title: anuncio.name
    }, anuncio.name))), /*#__PURE__*/React.createElement("button", {
      onClick: () => toggleMediaAd(ad.id, anuncio.id),
      disabled: isAdActive,
      className: `px-3 py-1.5 rounded text-[8px] font-bold uppercase transition-all ${isAdActive ? 'bg-blue-900/10 border border-blue-800/30 text-blue-400 cursor-default' : 'bg-zinc-900 border border-zinc-850 text-zinc-450 hover:text-white hover:bg-zinc-800'}`
    }, isAdActive ? 'Activo' : 'Activar'));
  }) : /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-650 italic py-2"
  }, "No se detectaron anuncios.")))))));
};

// --- PANTALLA DE LOGIN ---
const LoginScreen = ({
  onLogin
}) => {
  const [auditors, setAuditors] = useState([]);
  const [selected, setSelected] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${API_URL}/auth/auditors`).then(r => r.json()).then(d => {
      setAuditors(d.auditors || []);
      if (d.auditors?.length) setSelected(d.auditors[0]);
    }).catch(e => console.error("Error cargando auditores:", e));
  }, []);
  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nombre: selected,
          password: pass
        })
      });
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem('session_user', user.user);
        onLogin(user.user);
      } else {
        setError("Contraseña incorrecta");
      }
    } catch (e) {
      setError("Error de servidor. Revisa si el backend está activo.");
    } finally {
      setLoading(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex items-center justify-center p-4 bg-zinc-950"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full max-w-sm bg-zinc-900 p-8 rounded-lg border border-zinc-800 text-center shadow-md animate-fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-zinc-950 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-6 border border-zinc-800"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ShieldCheck",
    size: 30,
    className: "text-blue-500"
  })), /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-black uppercase tracking-wider text-white mb-1"
  }, "Meta Control"), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-zinc-550 uppercase tracking-widest mb-6 font-semibold"
  }, "Auditor\xEDa & Reglas de Automatizaci\xF3n"), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleLogin,
    className: "space-y-4 text-left"
  }, error && /*#__PURE__*/React.createElement("div", {
    className: "bg-red-950/45 border border-red-900/30 text-red-400 p-3 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2.5 animate-fade-in"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "AlertCircle",
    size: 14,
    className: "text-red-500"
  }), /*#__PURE__*/React.createElement("span", null, error)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[9px] font-bold text-zinc-550 uppercase ml-1 tracking-wider"
  }, "Auditor"), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("select", {
    className: "w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 outline-none appearance-none cursor-pointer text-xs font-bold",
    value: selected,
    onChange: e => setSelected(e.target.value)
  }, auditors.length === 0 ? /*#__PURE__*/React.createElement("option", null, "Buscando auditores...") : auditors.map(a => /*#__PURE__*/React.createElement("option", {
    key: a,
    value: a
  }, a))), /*#__PURE__*/React.createElement("span", {
    className: "absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronDown",
    size: 13
  })))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[9px] font-bold text-zinc-550 uppercase ml-1 tracking-wider"
  }, "Contrase\xF1a"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022",
    required: true,
    className: "w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white outline-none focus:border-blue-600 transition-colors font-mono",
    onChange: e => setPass(e.target.value)
  })), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: loading,
    className: "w-full bg-blue-600 hover:bg-blue-500 py-3.5 rounded-lg font-bold uppercase text-xs tracking-wider text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
  }, loading ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Icon, {
    name: "Loader2",
    size: 14,
    spin: true
  }), "Cargando...") : "Entrar al Panel"))));
};
const App = () => {
  const [session, setSession] = useState(localStorage.getItem('session_user'));
  return !session ? /*#__PURE__*/React.createElement(LoginScreen, {
    onLogin: setSession
  }) : /*#__PURE__*/React.createElement(Dashboard, {
    userEmail: session,
    onLogout: () => {
      localStorage.removeItem('session_user');
      setSession(null);
    }
  });
};
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render( /*#__PURE__*/React.createElement(App, null));