interface PaginaEnConstruccionProps {
  nombreModulo: string;
}

// Placeholder deliberado para los módulos que la Fase 1 todavía no construye
// (solo funda autenticación + layout). Se reemplaza módulo por módulo en las
// Fases 2 y 3 — evita enlaces rotos en el Sidebar sin fingir una pantalla
// funcional que no existe.
export function PaginaEnConstruccion({ nombreModulo }: PaginaEnConstruccionProps) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center text-slate-600 dark:text-slate-400">
      <p className="font-medium">{nombreModulo}</p>
      <p className="text-sm">Este módulo todavía no está implementado en el frontend.</p>
    </div>
  );
}
