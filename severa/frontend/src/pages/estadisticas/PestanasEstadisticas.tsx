import { NavLink } from 'react-router-dom';
import { RUTAS } from '../../routes/paths';

export function PestanasEstadisticas() {
  const claseLink = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`;

  return (
    <div className="flex gap-2">
      <NavLink to={RUTAS.estadisticas} end className={claseLink}>
        Resumen (M-06)
      </NavLink>
      <NavLink to={RUTAS.estadisticasFrecuencias} className={claseLink}>
        Distribución de frecuencias (M-05)
      </NavLink>
    </div>
  );
}
