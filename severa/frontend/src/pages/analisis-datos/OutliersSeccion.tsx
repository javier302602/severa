import { useOutliersDataset } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';

const CANTIDAD_MAXIMA_VALORES_MOSTRADOS = 15;

export function OutliersSeccion({ sesionId, onReiniciar }: { sesionId: string; onReiniciar: () => void }) {
  const { data, isLoading, isError, error } = useOutliersDataset(sesionId);

  if (isLoading) return <Spinner etiqueta="Detectando valores atípicos…" />;
  if (isError) return <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />;
  if (!data) return null;

  if (data.columnas.length === 0) {
    return <EstadoVacio mensaje="No hay columnas numéricas con datos suficientes para evaluar valores atípicos." />;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Criterio: un valor es atípico si cae por debajo de Q1 − 1.5×IQR o por encima de Q3 + 1.5×IQR.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Columna</th>
              <th className="px-4 py-2">Q1</th>
              <th className="px-4 py-2">Q3</th>
              <th className="px-4 py-2">Límite inf.</th>
              <th className="px-4 py-2">Límite sup.</th>
              <th className="px-4 py-2">Atípicos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.columnas.map((columna) => (
              <tr key={columna.columna}>
                <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{columna.columna}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{columna.q1.toFixed(2)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{columna.q3.toFixed(2)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{columna.limiteInferior.toFixed(2)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{columna.limiteSuperior.toFixed(2)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{columna.cantidadValoresAtipicos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.columnas
        .filter((columna) => columna.cantidadValoresAtipicos > 0)
        .map((columna) => (
          <div key={columna.columna} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-300">
              {columna.columna}: {columna.cantidadValoresAtipicos} valor(es) atípico(s)
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-400">
              {columna.valoresAtipicos
                .slice(0, CANTIDAD_MAXIMA_VALORES_MOSTRADOS)
                .map((valor) => `fila ${valor.filaIndice + 1}: ${valor.valor}`)
                .join(', ')}
              {columna.valoresAtipicos.length > CANTIDAD_MAXIMA_VALORES_MOSTRADOS &&
                ` y ${columna.valoresAtipicos.length - CANTIDAD_MAXIMA_VALORES_MOSTRADOS} más`}
            </p>
          </div>
        ))}

      {data.columnasExcluidas.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Columnas no evaluadas:{' '}
          {data.columnasExcluidas.map((columna, indice) => (
            <span key={columna.nombre}>
              {indice > 0 && ', '}
              <span className="font-medium">{columna.nombre}</span> ({columna.motivo})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
