import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarcarEstado, useRanking } from '../../hooks/usePriorizacion';
import type { NivelDeRiesgo } from '../../api/priorizacionService';
import { RotuloEscala } from '../../components/ui/RotuloEscala';
import { BadgeNivelRiesgo } from '../../components/ui/BadgeNivelRiesgo';
import { BadgeEstadoRemediacion } from '../../components/ui/BadgeEstadoRemediacion';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

// Carga por etapas (2026-07-19): antes esta pantalla siempre traía TODO el
// catálogo del analista de una sola llamada — con datasets grandes (cientos
// de miles de filas), eso significa una respuesta enorme y una espera larga
// antes de mostrar nada. Ahora se pide un nivel de riesgo por vez; cambiar
// de pestaña no bloquea ni reinicia las demás (cada una tiene su propio
// cache y su propio spinner, ver useRanking). RF-28 / RF-69: qué entra en
// cada nivel lo decide la escala del analista.
const NIVELES: readonly NivelDeRiesgo[] = ['Crítico', 'Alto', 'Moderado', 'Bajo'];

function claseDePestana(activa: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm ${activa ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600'}`;
}

// Renderizado en tandas (2026-07-19): la posición/orden del ranking depende
// del riesgo calculado sobre el catálogo COMPLETO del nivel (no se
// puede paginar en la base sin romper la numeración), así que la llamada al
// backend sigue trayendo todo — lo que se acota acá es cuántas filas se
// montan en el DOM de una sola vez, para no congelar el navegador si un
// nivel tiene miles de filas.
const TAMANO_TANDA = 200;

// M-09 (RF-69 a RF-76). Los botones de acción respetan la transición lineal
// del backend (Pendiente -> EnProceso -> Remediada, EstadoRemediacion.ts):
// solo se ofrece el SIGUIENTE estado válido, nunca un salto, para no
// depender de que el backend rechace un 409.
export function RankingPage() {
  const [nivel, setNivel] = useState<NivelDeRiesgo>('Crítico');
  const [cantidadVisible, setCantidadVisible] = useState(TAMANO_TANDA);
  const { data, isLoading, isError, error } = useRanking(nivel);
  const mutacion = useMarcarEstado();
  const visibles = data?.slice(0, cantidadVisible) ?? [];

  const onCambiarNivel = (valor: NivelDeRiesgo) => {
    setNivel(valor);
    setCantidadVisible(TAMANO_TANDA);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Priorización</h1>
        {/* RF-28 / RF-69: con qué escala se arman los niveles y sus plazos. */}
        <RotuloEscala />
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Nivel de riesgo">
        {NIVELES.map((valor) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={nivel === valor}
            onClick={() => onCambiarNivel(valor)}
            className={claseDePestana(nivel === valor)}
          >
            {valor}
          </button>
        ))}
      </div>

      {isLoading && <Spinner etiqueta={`Generando ranking (${nivel})…`} />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && data.length === 0 && (
        <EstadoVacio
          mensaje={
            <>
              No hay vulnerabilidades de nivel de riesgo "{nivel}" en tu catálogo.{' '}
              <Link to={RUTAS.dataset} className="underline">
                Importá un dataset
              </Link>{' '}
              o probá con otro nivel arriba.
            </>
          }
        />
      )}

      {mutacion.isError && <MensajeError mensaje={mensajeDeError(mutacion.error)} />}

      {data && data.length > 0 && (
        <>
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">CVE</th>
              <th className="px-4 py-2">CVSS</th>
              <th className="px-4 py-2">Nivel de riesgo</th>
              <th className="px-4 py-2">Plazo recomendado</th>
              <th className="px-4 py-2">Días para parche</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((item) => {
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
                  <td className="px-4 py-2">{item.plazoRecomendado} días</td>
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

        {cantidadVisible < data.length && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setCantidadVisible((actual) => actual + TAMANO_TANDA)}
              className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {`Mostrar más (${visibles.length} de ${data.length})`}
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
