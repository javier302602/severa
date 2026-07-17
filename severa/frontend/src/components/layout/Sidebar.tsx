import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { RUTAS } from '../../routes/paths';

interface ItemNavegacion {
  etiqueta: string;
  ruta: string;
  soloAdministrador?: boolean;
}

// Un ítem por módulo del SDS con pantalla propia. M-01/M-02 (registro/perfil)
// no están acá: registro es previo al login y perfil se accede desde el
// Header, no como "módulo" de análisis. M-12 Auditoría se oculta del lado del
// cliente para analistas sin rol administrador — es solo conveniencia de UI,
// la protección real es el middleware de rol del backend (RolMiddleware.ts).
const ITEMS_NAVEGACION: ItemNavegacion[] = [
  { etiqueta: 'Catálogo', ruta: RUTAS.catalogo },
  { etiqueta: 'Dataset', ruta: RUTAS.dataset },
  { etiqueta: 'Análisis de Datos', ruta: RUTAS.analisisDatos },
  { etiqueta: 'Estadísticas', ruta: RUTAS.estadisticas },
  { etiqueta: 'Gráficos', ruta: RUTAS.graficos },
  { etiqueta: 'Comparación', ruta: RUTAS.comparacion },
  { etiqueta: 'Priorización', ruta: RUTAS.priorizacion },
  { etiqueta: 'Informes', ruta: RUTAS.informes },
  { etiqueta: 'Búsqueda avanzada', ruta: RUTAS.busqueda },
  { etiqueta: 'Auditoría', ruta: RUTAS.auditoria, soloAdministrador: true },
  { etiqueta: 'Notificaciones', ruta: RUTAS.notificaciones },
  { etiqueta: 'Cómo funciona SEVERA', ruta: RUTAS.comoFunciona }
];

export function Sidebar() {
  const { analista } = useAuth();

  const itemsVisibles = ITEMS_NAVEGACION.filter((item) => !item.soloAdministrador || analista?.rol === 'administrador');

  return (
    <nav className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
      <p className="mb-4 px-2 text-lg font-semibold text-slate-800 dark:text-slate-200">SEVERA</p>
      <ul className="space-y-1">
        {itemsVisibles.map((item) => (
          <li key={item.ruta}>
            <NavLink
              to={item.ruta}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${
                  isActive ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`
              }
            >
              {item.etiqueta}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
