import React, { useState } from 'react';
import {
    Lock,
    Mail,
    ArrowRight,
    LogOut,
    Activity,
    DollarSign,
    BarChart3,
    UserCircle2
} from 'lucide-react';

export default function App() {
    // --- ESTADO GLOBAL DE LA APP ---
    // Controla si el usuario ha iniciado sesión
    const [user, setUser] = useState(null);

    // Funciones simuladas para interactuar con el futuro Backend
    const handleLogin = (userData) => {
        // TODO: Aquí harías el POST a tu backend (ej. /api/login)
        setUser(userData);
    };

    const handleLogout = () => {
        // TODO: Aquí limpiarías el token de sesión y notificarías al backend
        setUser(null);
    };

    // Renderizado condicional: Si no hay usuario, muestra Login. Si hay, muestra el Panel.
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#4a3434] to-slate-900 text-slate-100 font-sans selection:bg-rose-500/30">
            {!user ? (
                <LoginScreen onLogin={handleLogin} />
            ) : (
                <DashboardScreen user={user} onLogout={handleLogout} />
            )}
        </div>
    );
}

// ==========================================
// COMPONENTE 1: PANTALLA DE LOGIN
// ==========================================
function LoginScreen({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const onSubmit = (e) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulamos un retraso de red (1 segundo) antes de "iniciar sesión"
        setTimeout(() => {
            onLogin({ name: 'Admin_01', role: 'Superadmin', email: email });
            setIsLoading(false);
        }, 1000);
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <div className="w-full max-w-md bg-white/10 backdrop-blur-lg border border-white/20 p-8 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">

                <div className="text-center mb-8">
                    <div className="bg-rose-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.4)]">
                        <BarChart3 className="w-8 h-8 text-rose-300" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Portal Meta Ads</h1>
                    <p className="text-slate-400 text-sm mt-1">Ingresa tus credenciales para continuar</p>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300 ml-1">Correo Electrónico</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all text-white placeholder-slate-500"
                                placeholder="admin@empresa.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300 ml-1">Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all text-white placeholder-slate-500"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                    >
                        {isLoading ? 'Autenticando...' : 'Iniciar Sesión'}
                        {!isLoading && <ArrowRight className="w-5 h-5" />}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ==========================================
// COMPONENTE 2: PANEL DE ADMINISTRACIÓN
// ==========================================
function DashboardScreen({ user, onLogout }) {
    const [isAutoActive, setIsAutoActive] = useState(false);

    const handleToggle = () => {
        const newState = !isAutoActive;
        setIsAutoActive(newState);

        // TODO: Llamada al backend para actualizar el estado del automatizador
        // Ejemplo: fetch('/api/campaigns/auto', { method: 'POST', body: JSON.stringify({ active: newState }) })
        console.log("Enviando al backend -> Estado del bot:", newState);
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8">
            {/* Header / Nav */}
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-rose-500/20 p-2 rounded-lg border border-rose-500/30">
                        <BarChart3 className="w-6 h-6 text-rose-400" />
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold">Administración Meta</h1>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex items-center gap-2">
                        <UserCircle2 className="w-8 h-8 text-slate-400" />
                        <div>
                            <p className="text-sm font-semibold leading-none">{user.name}</p>
                            <p className="text-xs text-slate-400 mt-1">{user.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-2 text-slate-400 hover:text-white bg-white/5 hover:bg-rose-500/20 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:inline text-sm font-medium">Salir</span>
                    </button>
                </div>
            </header>

            {/* Contenido Principal (Grid) */}
            <main className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Tarjeta: Control Automático */}
                <section className="col-span-1 md:col-span-3 lg:col-span-1 bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex flex-col justify-center items-center shadow-lg relative overflow-hidden group">
                    {/* Efecto de luz de fondo cuando está activo */}
                    <div className={`absolute inset-0 bg-rose-500/10 blur-xl transition-opacity duration-500 ${isAutoActive ? 'opacity-100' : 'opacity-0'}`}></div>

                    <h2 className="text-lg font-medium text-slate-300 mb-6 z-10">Motor Automático</h2>

                    <div className="flex items-center gap-4 z-10">
                        <label
                            onClick={handleToggle}
                            className="text-xl font-bold cursor-pointer select-none"
                        >
                            {isAutoActive ? 'ACTIVO' : 'INACTIVO'}
                        </label>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={isAutoActive}
                            onClick={handleToggle}
                            className={`w-16 h-8 flex items-center rounded-full p-1 cursor-pointer transition-all duration-300 focus:outline-none shadow-inner ${isAutoActive ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' : 'bg-slate-600'
                                }`}
                        >
                            <div
                                className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${isAutoActive ? 'translate-x-8' : 'translate-x-0'
                                    }`}
                            ></div>
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-6 text-center z-10">
                        El sistema {isAutoActive ? 'está optimizando' : 'no está optimizando'} las campañas automáticamente.
                    </p>
                </section>

                {/* Tarjeta: Métricas (Ocupa más espacio) */}
                <section className="col-span-1 md:col-span-3 lg:col-span-2 bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg">
                    <h2 className="text-lg font-medium text-slate-300 mb-6 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-rose-400" />
                        Resumen en Tiempo Real
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Widget Activos */}
                        <div className="bg-black/30 p-5 rounded-xl border border-white/5 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400 font-medium mb-1">Anuncios Activos</p>
                                <p className="text-4xl font-bold text-white">
                                    12 {/* TODO: Consumir de Backend */}
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                                <BarChart3 className="w-6 h-6 text-blue-400" />
                            </div>
                        </div>

                        {/* Widget Gasto */}
                        <div className="bg-black/30 p-5 rounded-xl border border-white/5 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400 font-medium mb-1">Gasto del Día</p>
                                <p className="text-4xl font-bold text-emerald-400 tracking-tight">
                                    $450<span className="text-2xl text-emerald-600">.00</span> {/* TODO: Consumir de Backend */}
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                <DollarSign className="w-6 h-6 text-emerald-400" />
                            </div>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
}