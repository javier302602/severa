import { Link } from 'react-router-dom';
import { useMarcarEstado, useRanking } from '../../hooks/usePriorizacion';
import { BadgeNivelRiesgo } from '../../components/ui/BadgeNivelRiesgo';
import { BadgeEstadoRemediacion } from '../../components/ui/BadgeEstadoRemediacion';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

// M-09 (RF-69 a RF-76). Los botones de acción respetan la transición lineal
// del backend (Pendiente -> EnProceso -> Remediada, EstadoRemediacion.ts):
// solo se ofrece el SIGUIENTE estado válido, nunca un salto, para no
// depender de que el backend rechace un 409.
export function RankingPage() {
  const { data, isLoading, isError, error } = useRanking();
  const mutacion = useMarcarEstado();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Priorización</h1>

      {isLoading && <Spinner etiqueta="Generando ranking…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && data.length === 0 && (
        <EstadoVacio
          mensaje={
            <>
              Todavía no hay vulnerabilidades cargadas.{' '}
              <Link to={RUTAS.dataset} className="underline">
                Importá un dataset
              </Link>{' '}
              para ver el ranking.
            </>
          }
        />
      )}

      {mutacion.isError && <MensajeError mensaje={mensajeDeError(mutacion.error)} />}

      {data && data.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">CVE</th>
              <th className="px-4 py-2">CVSS</th>
              <th className="px-4 py-2">Nivel de riesgo</th>
              <th className="px-4 py-2">Días para parche</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const enCurso = mutacion.isPending && mutacion.variables?.cve === item.cve;

              return (
                <tr key={item.cve} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{item.posicion}</td>
                  <td className="px-4 py-2">
                    <Link to={RUTAS.vulnerabilidadDetalle(item.cve)} className="font-medium text-slate-900 dark:text-slate-100 underline">
                      {item.cve}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{item.cvssScore.toFixed(1)}</td>
                  <td className="px-4 py-2">
                    <BadgeNivelRiesgo nivel={item.nivelDeRiesgo} />
                  </td>
                  <td className="px-4 py-2">{item.diasParaParche ?? '—'}</td>
                  <td className="px-4 py-2">
                    <BadgeEstadoRemediacion estado={item.estado} />
                  </td>
                  <td className="px-4 py-2">
                    {item.estado === 'Pendiente' && (
                      <button
                        type="button"
                        disabled={enCurso}
                        onClick={() => mutacion.mutate({ cve: item.cve, estado: 'EnProceso' })}
                        className="rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                      >
                        {enCurso ? 'Guardando…' : 'Marcar en proceso'}
                      </button>
                    )}
                    {item.estado === 'EnProceso' && (
                      <button
                        type="button"
                        disabled={enCurso}
                        onClick={() => mutacion.mutate({ cve: item.cve, estado: 'Remediada' })}
                        className="rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                      >
                        {enCurso ? 'Guardando…' : 'Marcar remediada'}
                      </button>
                    )}
                    {item.estado === 'Remediada' && <span className="text-xs text-slate-500 dark:text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
