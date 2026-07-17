import { useMatrizCorrelacion } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';

// Mismo criterio de color que el heatmap del informe PDF/Word (Fase 5,
// dibujarHeatmap en DibujoDeGraficosPdf.ts): escala divergente azul (-1) —
// blanco (0) — rojo (+1). Reimplementado acá en CSS/TS puro a propósito —
// el frontend es un proyecto npm separado del backend, no hay forma de
// compartir código entre ambos sin un paquete nuevo, y esta es la única
// función que necesitaría compartirse.
function colorDivergente(valor: number): string {
  const t = Math.max(-1, Math.min(1, valor));
  const [rDestino, gDestino, bDestino] = t >= 0 ? [220, 38, 38] : [30, 64, 175];
  const f = Math.abs(t);
  const interpolar = (de: number, a: number) => Math.round(de + (a - de) * f);
  return `rgb(${interpolar(255, rDestino)}, ${interpolar(255, gDestino)}, ${interpolar(255, bDestino)})`;
}

export function CorrelacionSeccion({ sesionId, onReiniciar }: { sesionId: string; onReiniciar: () => void }) {
  const { data, isLoading, isError, error } = useMatrizCorrelacion(sesionId);

  if (isLoading) return <Spinner etiqueta="Calculando matriz de correlación…" />;
  if (isError) return <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />;
  if (!data) return null;

  if (data.columnas.length === 0) {
    return (
      <EstadoVacio mensaje="No hay al menos dos columnas numéricas con datos suficientes para calcular correlaciones." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1" />
              {data.columnas.map((nombre) => (
                <th key={nombre} className="max-w-[6rem] truncate p-1 text-left font-medium text-slate-600 dark:text-slate-400" title={nombre}>
                  {nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.filas.map((fila) => (
              <tr key={fila.columna}>
                <th className="max-w-[8rem] truncate p-1 text-right font-medium text-slate-600 dark:text-slate-400" title={fila.columna}>
                  {fila.columna}
                </th>
                {fila.correlaciones.map((celda) => (
                  <td
                    key={celda.columna}
                    className="h-12 w-12 text-center align-middle"
                    style={celda.valor === null ? { backgroundColor: '#e2e8f0' } : { backgroundColor: colorDivergente(celda.valor) }}
                    title={celda.valor === null ? celda.motivo : `r = ${celda.valor.toFixed(3)}`}
                  >
                    <span className={celda.valor !== null && Math.abs(celda.valor) > 0.6 ? 'text-white' : 'text-slate-900'}>
                      {celda.valor === null ? 'N/D' : celda.valor.toFixed(2)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.columnasExcluidas.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Columnas no incluidas:{' '}
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
