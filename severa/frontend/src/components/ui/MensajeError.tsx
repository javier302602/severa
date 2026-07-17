interface MensajeErrorProps {
  mensaje: string;
}

export function MensajeError({ mensaje }: MensajeErrorProps) {
  return (
    <div
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
      role="alert"
    >
      {mensaje}
    </div>
  );
}
