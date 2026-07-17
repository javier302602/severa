import { useState } from 'react';
import { useAnalisisUnivariado } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import type { AnalisisUnivariado, DiagnosticoColumna } from '../../api/analisisDatosService';

function TablaDistribucionNumerica({ analisis }: { analisis: Extract<AnalisisUnivariado, { tipo: 'numerica' }> }) {
  const r = analisis.resumenCincoNumeros;
  const maximoFrecuencia = Math.max(1, ...analisis.distribucion.map((bin) => bin.frecuenciaAbsoluta));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Mínimo', r.minimo],
          ['Q1', r.q1],
          ['Mediana', r.mediana],
          ['Q3', r.q3],
          ['Máximo', r.maximo],
          ['Media', r.media]
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta as string} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">{etiqueta}</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{(valor as number).toFixed(2)}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Desviación estándar: {analisis.desviacionEstandar?.toFixed(4) ?? 'N/D (menos de 2 valores)'} — Coef. de variación:{' '}
        {analisis.coeficienteVariacion?.toFixed(2) ?? 'N/D'}% — {analisis.valoresFaltantes} valor(es) faltante(s) de{' '}
        {analisis.valoresValidos + analisis.valoresFaltantes}.
      </p>
      <div className="space-y-1">
        {analisis.distribucion.map((bin) => (
          <div key={bin.intervalo} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-slate-600 dark:text-slate-400">{bin.intervalo}</span>
            <div className="h-4 flex-1 rounded bg-slate-100 dark:bg-slate-700">
              <div
                className="h-4 rounded bg-blue-500"
                style={{ width: `${(bin.frecuenciaAbsoluta / maximoFrecuencia) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-slate-600 dark:text-slate-400">{bin.frecuenciaAbsoluta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TablaDistribucionCategorica({
  analisis
}: {
  analisis: Extract<AnalisisUnivariado, { tipo: 'categorica' | 'texto' }>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {analisis.valoresUnicos} valor(es) único(s) — moda: {analisis.moda.join(', ') || '—'} — {analisis.valoresFaltantes}{' '}
        valor(es) faltante(s).
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Frecuencia</th>
              <th className="px-4 py-2">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {analisis.distribucion.map((fila) => (
              <tr key={fila.valor}>
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{fila.valor}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{fila.frecuenciaAbsoluta}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{fila.frecuenciaRelativaPorcentaje.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TablaDistribucionFecha({ analisis }: { analisis: Extract<AnalisisUnivariado, { tipo: 'fecha' }> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Rango: {analisis.minimo ? new Date(analisis.minimo).toLocaleDateString() : '—'} a{' '}
        {analisis.maximo ? new Date(analisis.maximo).toLocaleDateString() : '—'} — {analisis.valoresFaltantes} valor(es)
        faltante(s).
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Frecuencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {analisis.distribucion.map((fila) => (
              <tr key={fila.valor}>
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{fila.valor}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{fila.frecuenciaAbsoluta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnalisisUnivariadoSeccion({
  sesionId,
  columnas,
  onReiniciar
}: {
  sesionId: string;
  columnas: DiagnosticoColumna[];
  onReiniciar: () => void;
}) {
  const [columnaSeleccionada, setColumnaSeleccionada] = useState<string | null>(columnas[0]?.nombre ?? null);
  const { data, isLoading, isError, error } = useAnalisisUnivariado(sesionId, columnaSeleccionada);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="columna-univariado" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Columna
        </label>
        <select
          id="columna-univariado"
          value={columnaSeleccionada ?? ''}
          onChange={(evento) => setColumnaSeleccionada(evento.target.value)}
          className="campo-formulario mt-1 py-1.5"
        >
          {columnas.map((columna) => (
            <option key={columna.nombre} value={columna.nombre}>
              {columna.nombre} ({columna.tipo})
            </option>
          ))}
        </select>
      </div>

      {isLoading && <Spinner etiqueta="Analizando columna…" />}
      {isError && <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />}
      {!isLoading && !isError && !data && <EstadoVacio mensaje="Elegí una columna para analizar." />}
      {data?.tipo === 'numerica' && <TablaDistribucionNumerica analisis={data} />}
      {(data?.tipo === 'categorica' || data?.tipo === 'texto') && <TablaDistribucionCategorica analisis={data} />}
      {data?.tipo === 'fecha' && <TablaDistribucionFecha analisis={data} />}
    </div>
  );
}
