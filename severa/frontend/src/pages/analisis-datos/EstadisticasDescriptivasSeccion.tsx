import { useEstadisticasDescriptivas } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import type { ResumenColumna } from '../../api/analisisDatosService';

function resumenComoTexto(columna: ResumenColumna): string {
  if (columna.tipo === 'numerica') {
    return `media=${columna.media.toFixed(2)}, mediana=${columna.mediana.toFixed(2)}, mín=${columna.minimo.toFixed(2)}, máx=${columna.maximo.toFixed(2)}`;
  }
  if (columna.tipo === 'fecha') {
    return columna.minimo && columna.maximo
      ? `de ${new Date(columna.minimo).toLocaleDateString()} a ${new Date(columna.maximo).toLocaleDateString()}`
      : 'sin fechas válidas';
  }
  const top = columna.masFrecuente[0];
  return top ? `${columna.valoresUnicos} valor(es) único(s); más frecuente: "${top.valor}" (${top.frecuencia})` : 'sin valores';
}

export function EstadisticasDescriptivasSeccion({ sesionId, onReiniciar }: { sesionId: string; onReiniciar: () => void }) {
  const { data, isLoading, isError, error } = useEstadisticasDescriptivas(sesionId);

  if (isLoading) return <Spinner etiqueta="Calculando estadísticas descriptivas…" />;
  if (isError) return <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />;
  if (!data || data.columnas.length === 0) return <EstadoVacio mensaje="El dataset no tiene columnas para resumir." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Columna</th>
            <th className="px-4 py-2">Tipo</th>
            <th className="px-4 py-2">Resumen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {data.columnas.map((columna) => (
            <tr key={columna.nombre}>
              <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{columna.nombre}</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{columna.tipo}</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{resumenComoTexto(columna)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
