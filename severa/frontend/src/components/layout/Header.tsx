import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotificaciones } from '../../hooks/useNotificaciones';
import { RUTAS } from '../../routes/paths';

export function Header() {
  const { analista, logout } = useAuth();
  const { tema, alternarTema } = useTheme();
  // No maneja error/carga acá a propósito: es un badge secundario en el
  // header, no una pantalla — si falla, simplemente no muestra número. El
  // centro de notificaciones (Fase 2, M-13) sí maneja carga/error/vacío como
  // pantalla propia.
  const { data: notificaciones } = useNotificaciones();
  const noLeidas = notificaciones?.filter((notificacion) => !notificacion.leida).length ?? 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm px-6">
      <Link to={RUTAS.notificaciones} className="relative text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100" aria-label="Notificaciones">
        🔔
        {noLeidas > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white">
            {noLeidas}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={alternarTema}
          aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          {tema === 'dark' ? '☀️' : '🌙'}
        </button>
        <Link to={RUTAS.perfil} className="text-sm text-slate-700 dark:text-slate-300 hover:underline">
          {analista?.nombre} <span className="text-slate-500 dark:text-slate-400">({analista?.rol})</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
