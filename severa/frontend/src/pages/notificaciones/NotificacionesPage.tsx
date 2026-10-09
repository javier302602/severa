import { useEffect, useState } from 'react';
import {
  useEliminarNotificaciones,
  useEliminarNotificacionesLeidas,
  useMarcarNotificacionLeida,
  useMarcarTodasLasNotificacionesLeidas,
  useNotificaciones
} from '../../hooks/useNotificaciones';
import { NOTIFICACIONES_POR_PAGINA } from '../../api/notificacionService';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import type { TipoNotificacion } from '../../types/Notificacion';

// Una etiqueta por cada tipo que emite el backend (TipoNotificacion en
// Notificacion.ts). Faltaban 'PlazoProximoAVencer' y 'PerfilActualizado': esas
// notificaciones se mostraban sin etiqueta.
const ETIQUETA_TIPO: Record<TipoNotificacion, string> = {
  VulnerabilidadCritica: 'Vulnerabilidad crítica',
  PlazoVencido: 'Plazo vencido',
  PlazoProximoAVencer: 'Plazo próximo a vencer',
  InformeListo: 'Informe listo',
  ActualizacionNVD: 'Actualización NVD',
  ImportacionCompletada: 'Importación completada',
  PerfilActualizado: 'Perfil actualizado',
  LimpiezaCompletada: 'Limpieza completada'
};

// Si el backend sumara un tipo que esta pantalla todavía no conoce, se
// muestra una etiqueta genérica en vez de dejar el lugar vacío.
function etiquetaDeTipo(tipo: string): string {
  return (ETIQUETA_TIPO as Record<string, string>)[tipo] ?? 'Notificación';
}

// M-13 (RF-99 a RF-104). El centro de notificaciones, de a páginas.
//
// Antes montaba una fila por cada notificación del analista, todas juntas:
// con decenas de miles acumuladas la pantalla se quedaba sin memoria. Ahora
// pide y dibuja una página (NOTIFICACIONES_POR_PAGINA) por vez; el total y la
// cantidad de no leídas los informa el backend sobre todo el centro.
export function NotificacionesPage() {
  const [pagina, setPagina] = useState(0);
  const { data, isLoading, isError, error, isPlaceholderData } = useNotificaciones(pagina);
  const marcarLeida = useMarcarNotificacionLeida();
  const marcarTodas = useMarcarTodasLasNotificacionesLeidas();
  const eliminarVarias = useEliminarNotificaciones();
  const eliminarLeidas = useEliminarNotificacionesLeidas();

  const notificaciones = data?.notificaciones ?? [];
  const total = data?.total ?? 0;
  const noLeidas = data?.noLeidas ?? 0;
  const leidas = total - noLeidas;
  const totalDePaginas = Math.max(1, Math.ceil(total / NOTIFICACIONES_POR_PAGINA));

  // "Eliminar seleccionadas": los ids marcados con la casilla. La selección
  // es de la página que se está viendo: se vacía al cambiar de página.
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

  const irAPagina = (nueva: number) => {
    setPagina(nueva);
    setSeleccionadas(new Set());
  };

  // Si la página que se estaba viendo quedó vacía (se eliminó lo último que
  // tenía) y no es la primera, se retrocede a la última que sí tiene algo.
  useEffect(() => {
    if (data && !isPlaceholderData && pagina > 0 && pagina >= totalDePaginas) {
      setPagina(totalDePaginas - 1);
      setSeleccionadas(new Set());
    }
  }, [data, isPlaceholderData, pagina, totalDePaginas]);

  const alternarSeleccion = (id: string) => {
    setSeleccionadas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });
  };

  const onEliminarSeleccionadas = () => {
    if (seleccionadas.size === 0) return;
    eliminarVarias.mutate([...seleccionadas], {
      onSuccess: () => setSeleccionadas(new Set())
    });
  };

  const onEliminarLeidas = () => {
    eliminarLeidas.mutate(undefined, { onSuccess: () => setSeleccionadas(new Set()) });
  };

  const claseBoton =
    'rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50';
  const claseBotonRojo =
    'rounded-md border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50';
  const desde = total === 0 ? 0 : pagina * NOTIFICACIONES_POR_PAGINA + 1;
  const hasta = pagina * NOTIFICACIONES_POR_PAGINA + notificaciones.length;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Notificaciones</h1>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" disabled={seleccionadas.size === 0 || eliminarVarias.isPending} onClick={onEliminarSeleccionadas} className={claseBotonRojo}>
            {eliminarVarias.isPending ? 'Eliminando…' : `Eliminar seleccionadas${seleccionadas.size > 0 ? ` (${seleccionadas.size})` : ''}`}
          </button>
          {leidas > 0 && (
            <button type="button" disabled={eliminarLeidas.isPending} onClick={onEliminarLeidas} className={claseBotonRojo}>
              {eliminarLeidas.isPending ? 'Eliminando…' : `Eliminar las leídas (${leidas})`}
            </button>
          )}
          {noLeidas > 0 && (
            <button type="button" disabled={marcarTodas.isPending} onClick={() => marcarTodas.mutate()} className={claseBoton}>
              {marcarTodas.isPending ? 'Marcando…' : 'Marcar todas como leídas'}
            </button>
          )}
        </div>
      </div>

      {isLoading && <Spinner etiqueta="Cargando notificaciones…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {marcarLeida.isError && <MensajeError mensaje={mensajeDeError(marcarLeida.error)} />}
      {marcarTodas.isError && <MensajeError mensaje={mensajeDeError(marcarTodas.error)} />}
      {eliminarVarias.isError && <MensajeError mensaje={mensajeDeError(eliminarVarias.error)} />}
      {eliminarLeidas.isError && <MensajeError mensaje={mensajeDeError(eliminarLeidas.error)} />}
      {data && total === 0 && <EstadoVacio mensaje="No tenés notificaciones." />}

      {data && total > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400" role="status">
          {total} notificación(es), {noLeidas} sin leer. Mostrando {desde}–{hasta}.
        </p>
      )}

      {notificaciones.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          {notificaciones.map((notificacion) => {
            const marcandoEsta = marcarLeida.isPending && marcarLeida.variables === notificacion.id;

            return (
              <li
                key={notificacion.id}
                className={`flex items-start gap-3 p-4 ${notificacion.leida ? '' : 'bg-slate-50 dark:bg-slate-800/60'}`}
              >
                <input
                  type="checkbox"
                  checked={seleccionadas.has(notificacion.id)}
                  onChange={() => alternarSeleccion(notificacion.id)}
                  className="mt-1 shrink-0"
                  aria-label={`Seleccionar notificación: ${notificacion.mensaje}`}
                />
                <div className="flex flex-1 items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      {etiquetaDeTipo(notificacion.tipo)}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalDePaginas > 1 && (
        <nav className="flex items-center justify-between gap-4" aria-label="Páginas de notificaciones">
          <button type="button" disabled={pagina === 0} onClick={() => irAPagina(pagina - 1)} className={claseBoton}>
            ← Más recientes
          </button>
          <span className="text-xs text-slate-600 dark:text-slate-400">
            Página {pagina + 1} de {totalDePaginas}
          </span>
          <button type="button" disabled={pagina >= totalDePaginas - 1} onClick={() => irAPagina(pagina + 1)} className={claseBoton}>
            Más antiguas →
          </button>
        </nav>
      )}
    </div>
  );
}
