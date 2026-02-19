/**
 * SISTEMA: Control Meta Pro v4.5
 * CORRECCIÓN: Detección de puerto 8000 para evitar 404 de Nginx.
 */
const { useState, useEffect, useMemo, useRef } = React;

// --- COMPONENTE: ICONOS ---
const Icon = ({ name, size = 16, className = "" }) => {
    const iconRef = useRef(null);
    useEffect(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, [name]);
    return <i data-lucide={name} className={className} style={{ width: size, height: size }}></i>;
};

// --- CONFIGURACIÓN DE URL ---
// Si el dominio es manejometa.libresdeumas.com, la API vive en el puerto 8000
const getApiUrl = () => {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    // Si estamos en producción (VPS), forzamos el puerto 8000 que es donde vive FastAPI
    if (host.includes('libresdeumas.com')) {
        return `${protocol}//${host}:8000`;
    }
    // Localhost
    return `http://localhost:8000`;
};

const API_URL = getApiUrl();

// --- FIREBASE INIT ---
const firebaseConfig = JSON.parse(window.__firebase_config || '{}');
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const appId = window.__app_id || 'control-meta-pro-v4';

const ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717",
    "120238886420220717", "120238886413960717", "120238886369210717",
    "120234721717970717", "120234721717960717", "120234721717950717",
    "120233618279570717", "120233618279540717", "120233611687810717",
    "120232204774610717", "120232204774590717", "120232204774570717",
    "120232157515490717", "120232157515480717", "120232157515460717"
];

/**
 * LOGIN SCREEN
 */
const LoginScreen = ({ onLogin }) => {
    const [auditors, setAuditors] = useState([]);
    const [selected, setSelected] = useState("");
    const [pass, setPass] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        console.log("Intentando conectar a API en:", API_URL);
        fetch(`${API_URL}/auth/auditors`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`Servidor respondió con status ${res.status}`);
                return res.json();
            })
            .then(d => {
                setAuditors(d.auditors || []);
                if (d.auditors?.length) setSelected(d.auditors[0]);
            })
            .catch(e => {
                console.error("Error cargando auditores:", e);
                setError("No se pudo obtener la lista de auditores. Verifique que el puerto 8000 esté abierto.");
            });
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
                localStorage.setItem('session_user', selected);
                onLogin(selected);
            } else {
                alert("Credenciales incorrectas");
            }
        } catch (e) {
            alert("Error de conexión con el backend en el puerto 8000");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-black">
            <div className="w-full max-w-md bg-zinc-900 border border-white/5 p-12 rounded-[3rem] shadow-2xl text-center">
                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8">
                    <Icon name="shield-check" size={40} className="text-white" />
                </div>
                <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter mb-10">Control Meta</h2>

                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-500 text-[10px] mb-6 font-bold uppercase">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6 text-left">
                    <select
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none"
                        value={selected} onChange={e => setSelected(e.target.value)}
                    >
                        {auditors.length > 0 ? (
                            auditors.map(a => <option key={a} value={a}>{a}</option>)
                        ) : (
                            <option>Buscando auditores...</option>
                        )}
                    </select>
                    <input
                        type="password" placeholder="Contraseña" required
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-blue-500 transition-all"
                        onChange={e => setPass(e.target.value)}
                    />
                    <button className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase text-white shadow-xl hover:bg-blue-500 transition-all">
                        {loading ? "Sincronizando..." : "Ingresar"}
                    </button>
                </form>
            </div>
        </div>
    );
};

// ... (Resto del componente Dashboard se mantiene igual) ...

const App = () => {
    const [session, setSession] = useState(localStorage.getItem('session_user'));
    return !session ? <LoginScreen onLogin={setSession} /> : <div className="text-white p-10">Panel Cargado para {session}</div>;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);