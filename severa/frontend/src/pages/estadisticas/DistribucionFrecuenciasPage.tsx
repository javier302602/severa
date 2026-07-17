import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFrecuenciasAgrupadas, useFrecuenciasSinAgrupar } from '../../hooks/useEstadisticas';
import { PestanasEstadisticas } from './PestanasEstadisticas';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

type Vista = 'agrupada' | 'sinAgrupar';

export function DistribucionFrecuenciasPage() {
  const [vista, setVista] = useState<Vista>('agrupada');
  const agrupada = useFrecuenciasAgrupadas();
  const sinAgrupar = useFrecuenciasSinAgrupar();
  const activa = vista === 'agrupada' ? agrupada : sinAgrupar;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Estadísticas</h1>
      <PestanasEstadisticas />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setVista('agrupada')}
          className={`rounded-md px-3 py-1.5 text-sm ${vista === 'agrupada' ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600'}`}
        >
          Con intervalos agrupados
        </button>
        <button
          type="button"
          onClick={() => setVista('sinAgrupar')}
          className={`rounded-md px-3 py-1.5 text-sm ${vista === 'sinAgrupar' ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600'}`}
        >
          Sin agrupar
        </button>
      </div>

      {activa.isLoading && <Spinner etiqueta="Calculando…" />}

      {activa.isError && esCatalogoVacio(activa.error) && (
        <EstadoVacio
          mensaje={
            <>
              Todavía no hay vulnerabilidades cargadas.{' '}
              <Link to={RUTAS.dataset} className="underline">
                Importá un dataset
              </Link>{' '}
              para ver la distribución de frecuencias.
            </>
          }
        />
      )}
      {activa.isError && !esCatalogoVacio(activa.error) && <MensajeError mensaje={mensajeDeError(activa.error)} />}

      {vista === 'agrupada' && agrupada.data && (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Intervalo</th>
              <th className="px-4 py-2">Marca de clase</th>
              <th className="px-4 py-2">Frec. absoluta</th>
              <th className="px-4 py-2">Frec. relativa</th>
              <th className="px-4 py-2">Frec. acumulada</th>
              <th className="px-4 py-2">Frec. rel. acumulada</th>
            </tr>
          </thead>
          <tbody>
            {agrupada.data.map((fila) => (
              <tr key={fila.intervalo} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{fila.intervalo}</td>
                <td className="px-4 py-2">{fila.marcaDeClase.toFixed(1)}</td>
                <td className="px-4 py-2">{fila.frecuenciaAbsoluta}</td>
                <td className="px-4 py-2">{fila.frecuenciaRelativaPorcentaje.toFixed(1)}%</td>
                <td className="px-4 py-2">{fila.frecuenciaAcumulada}</td>
                <td className="px-4 py-2">{(fila.frecuenciaRelativaAcumulada * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vista === 'sinAgrupar' && sinAgrupar.data && (
        <table className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">CVSS Score</th>
              <th className="px-4 py-2">Frecuencia</th>
            </tr>
          </thead>
          <tbody>
            {sinAgrupar.data.map((fila) => (
              <tr key={fila.valor} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{fila.valor.toFixed(1)}</td>
                <td className="px-4 py-2">{fila.frecuencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
