import type { ReactNode } from 'react';

interface EstadoVacioProps {
  mensaje: ReactNode;
}

export function EstadoVacio({ mensaje }: EstadoVacioProps) {
  return <p className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">{mensaje}</p>;
}
