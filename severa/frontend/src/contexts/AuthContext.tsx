import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, type CredencialesLogin } from '../api/authService';
import { configurarHttpClient } from '../api/httpClient';
import type { Analista } from '../types/Analista';

const CLAVE_SESION = 'severa.sesion';

interface SesionPersistida {
  token: string;
  analista: Analista;
}

interface AuthContextValor {
  analista: Analista | null;
  token: string | null;
  cargandoSesion: boolean;
  login: (credenciales: CredencialesLogin) => Promise<void>;
  logout: () => void;
  actualizarAnalista: (analista: Analista) => void;
}

const AuthContext = createContext<AuthContextValor | undefined>(undefined);

function leerSesionPersistida(): SesionPersistida | null {
  const crudo = localStorage.getItem(CLAVE_SESION);
  if (!crudo) return null;

  try {
    return JSON.parse(crudo) as SesionPersistida;
  } catch {
    return null;
  }
}

// Decisión: el analista autenticado se guarda tal cual lo devuelve
// POST /auth/login (no se decodifica el JWT). El payload del JWT
// (AutenticacionMiddleware.ts) solo trae `sub` (id) y `rol` — nombre y correo
// NO están en el token, así que decodificarlo no alcanzaría para mostrar
// "Hola, <nombre>" en el Header sin una llamada adicional. GET /perfil (RF-09)
// sí existe (PerfilController.ts) y PerfilPage lo usa para refrescar la
// vista propia; `actualizarAnalista` (abajo) propaga ese resultado también acá
// para que el Header no se quede con el nombre viejo tras un PUT /perfil tras
// esta misma pestaña.
// Hueco que sigue existiendo: si el analista edita su perfil en OTRA
// pestaña/sesión, esta pestaña no se entera hasta el próximo login — no hay
// mecanismo de sincronización entre pestañas (BroadcastChannel, polling, etc.).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [analista, setAnalista] = useState<Analista | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setAnalista(null);
    localStorage.removeItem(CLAVE_SESION);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    configurarHttpClient({
      obtenerToken: () => tokenRef.current,
      alRecibirNoAutorizado: logout
    });
  }, [logout]);

  useEffect(() => {
    const sesion = leerSesionPersistida();
    if (sesion) {
      tokenRef.current = sesion.token;
      setToken(sesion.token);
      setAnalista(sesion.analista);
    }
    setCargandoSesion(false);
  }, []);

  const login = useCallback(async (credenciales: CredencialesLogin) => {
    const respuesta = await authService.login(credenciales);
    tokenRef.current = respuesta.token;
    setToken(respuesta.token);
    setAnalista(respuesta.analista);
    localStorage.setItem(CLAVE_SESION, JSON.stringify(respuesta));
  }, []);

  // Usado por useEditarPerfil (PUT /perfil): sin esto, el Header y cualquier
  // otra parte que lea `analista` del contexto seguirían mostrando el nombre
  // viejo hasta el próximo login, en esta misma pestaña.
  const actualizarAnalista = useCallback((analistaActualizado: Analista) => {
    setAnalista(analistaActualizado);
    if (tokenRef.current) {
      localStorage.setItem(CLAVE_SESION, JSON.stringify({ token: tokenRef.current, analista: analistaActualizado }));
    }
  }, []);

  const valor = useMemo<AuthContextValor>(
    () => ({ analista, token, cargandoSesion, login, logout, actualizarAnalista }),
    [analista, token, cargandoSesion, login, logout, actualizarAnalista]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return contexto;
}
