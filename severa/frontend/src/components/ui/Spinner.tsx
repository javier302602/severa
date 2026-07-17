interface SpinnerProps {
  etiqueta?: string;
}

export function Spinner({ etiqueta = 'Cargando…' }: SpinnerProps) {
  return (
    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-600" />
      <span className="text-sm">{etiqueta}</span>
    </div>
  );
}
