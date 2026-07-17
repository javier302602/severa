import type { EstadoRemediacion } from '../../types/EstadoRemediacion';

const ESTILOS: Record<EstadoRemediacion, string> = {
  Pendiente: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  EnProceso: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Remediada: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
};

interface BadgeEstadoRemediacionProps {
  estado: EstadoRemediacion;
}

export function BadgeEstadoRemediacion({ estado }: BadgeEstadoRemediacionProps) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[estado]}`}>{estado}</span>;
}
