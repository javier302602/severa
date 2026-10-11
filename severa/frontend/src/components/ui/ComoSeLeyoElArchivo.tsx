import type { LecturaDelArchivo } from '../../api/datasetService';

// Cómo leyó el backend un .csv/.tsv (codificación, separador y convención
// decimal) y qué columnas dejó como texto por ambiguas. Se muestra justo
// después de cargar, para que el analista vea que "25,5" se leyó como 25,5 y
// no como 255, o por qué una columna no quedó numérica.
export function ComoSeLeyoElArchivo({ lectura }: { lectura: LecturaDelArchivo }) {
  return (
    <div
      className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200"
      role="status"
      aria-label="Cómo se leyó el archivo"
    >
      <p>
        <span className="font-medium">Cómo se leyó el archivo:</span> {lectura.descripcion}.
      </p>
      {lectura.avisos.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900 dark:text-amber-200">
          {lectura.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
