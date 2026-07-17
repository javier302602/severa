import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../ui/Spinner';
import { RUTAS } from '../../routes/paths';

// Envuelve todas las rutas privadas. La protección real vive en el backend
// (AutenticacionMiddleware.ts) — esto solo evita renderizar pantallas que de
// todos modos van a fallar con 401, y redirige antes de que el usuario vea un
// parpadeo de contenido protegido vacío.
export function ProtectedRoute() {
  const { analista, cargandoSesion } = useAuth();

  if (cargandoSesion) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner etiqueta="Verificando sesión…" />
      </div>
    );
  }

  if (!analista) {
    return <Navigate to={RUTAS.login} replace />;
  }

  return <Outlet />;
}
