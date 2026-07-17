import type { NivelDeRiesgo } from '../../api/priorizacionService';

const ESTILOS: Record<NivelDeRiesgo, string> = {
  Bajo: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  Moderado: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  Alto: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Crítico: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
};

interface BadgeNivelRiesgoProps {
  nivel: NivelDeRiesgo;
}

export function BadgeNivelRiesgo({ nivel }: BadgeNivelRiesgoProps) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[nivel]}`}>{nivel}</span>;
}
