import { useMarcarNotificacionLeida, useNotificaciones } from '../../hooks/useNotificaciones';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import type { TipoNotificacion } from '../../types/Notificacion';

const ETIQUETA_TIPO: Record<TipoNotificacion, string> = {
  VulnerabilidadCritica: 'Vulnerabilidad crítica',
  PlazoVencido: 'Plazo vencido',
  InformeListo: 'Informe listo',
  ActualizacionNVD: 'Actualización NVD'
};

// M-13 (RF-99 a RF-104). Reutiliza los hooks de Fase 1 (useNotificaciones,
// useMarcarNotificacionLeida) — el badge del Header ya los usaba para el
// contador; esta página es la vista completa a la que ese badge lleva.
export function NotificacionesPage() {
  const { data, isLoading, isError, error } = useNotificaciones();
  const marcarLeida = useMarcarNotificacionLeida();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Notificaciones</h1>

      {isLoading && <Spinner etiqueta="Cargando notificaciones…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {marcarLeida.isError && <MensajeError mensaje={mensajeDeError(marcarLeida.error)} />}
      {data && data.length === 0 && <EstadoVacio mensaje="No tenés notificaciones." />}

      {data && data.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          {data.map((notificacion) => {
            const marcandoEsta = marcarLeida.isPending && marcarLeida.variables === notificacion.id;

            return (
              <li
                key={notificacion.id}
                className={`flex items-start justify-between gap-4 p-4 ${notificacion.leida ? '' : 'bg-slate-50 dark:bg-slate-800/60'}`}
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    {ETIQUETA_TIPO[notificacion.tipo]}
                  </p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">{notificacion.mensaje}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(notificacion.fecha).toLocaleString()}</p>
                </div>
                {!notificacion.leida && (
                  <button
                    type="button"
                    disabled={marcandoEsta}
                    onClick={() => marcarLeida.mutate(notificacion.id)}
                    className="shrink-0 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    {marcandoEsta ? 'Guardando…' : 'Marcar como leída'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
