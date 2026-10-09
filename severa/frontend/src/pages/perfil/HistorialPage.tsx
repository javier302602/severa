import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useExportarHistorial, useHistorialDeAnalisis } from '../../hooks/usePerfil';
import { ANALISIS_POR_PAGINA, type AnalisisDelHistorial } from '../../api/perfilService';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { RUTAS } from '../../routes/paths';
import { CLASE_BOTON_SECUNDARIO, CLASE_CABECERA_DE_TABLA, CLASE_TARJETA } from '../analisis-datos/estilos';
import { pestanaDeAnalisis, type SolicitudDeReapertura } from '../analisis-datos/reaperturaDesdeHistorial';

// Dónde se retoma cada análisis del catálogo de vulnerabilidades: el catálogo
// queda guardado, así que "reabrir" es volver a la pantalla que lo calcula.
const PANTALLA_DEL_CATALOGO: Record<string, string> = {
  ResumenEstadistico: RUTAS.estadisticas,
  DistribucionDeFrecuencias: RUTAS.estadisticasFrecuencias,
  Graficos: RUTAS.graficos,
  ComparacionPorCategorias: RUTAS.comparacion,
  RankingDeUrgencia: RUTAS.priorizacion,
  InformeGenerado: RUTAS.informes,
  ResumenEjecutivo: RUTAS.informes
};

function nombreDeVersion(version: number | null): string | null {
  if (version === null) return null;
  return version === 0 ? 'original' : `versión ${version}`;
}

// RF-11 y RF-14 (M-02). El historial de análisis del analista: qué hizo,
// cuándo y sobre qué dataset; desde acá reabre un análisis anterior y exporta
// el historial a Excel.
export function HistorialPage() {
  const [pagina, setPagina] = useState(0);
  const { data, isLoading, isError, error, isPlaceholderData } = useHistorialDeAnalisis(pagina);
  const exportar = useExportarHistorial();
  const navigate = useNavigate();

  const eventos = data?.eventos ?? [];
  const total = data?.total ?? 0;
  const totalDePaginas = Math.max(1, Math.ceil(total / ANALISIS_POR_PAGINA));

  // Si la página pedida quedó más allá del final, se vuelve a la última.
  useEffect(() => {
    if (data && !isPlaceholderData && pagina > 0 && pagina >= totalDePaginas) setPagina(totalDePaginas - 1);
  }, [data, isPlaceholderData, pagina, totalDePaginas]);

  const onExportar = () => {
    exportar.mutate(undefined, { onSuccess: (blob) => descargarArchivo(blob, 'historial-de-analisis.xlsx') });
  };

  const reabrirDataset = (evento: AnalisisDelHistorial) => {
    if (!evento.datasetId) return;
    const solicitud: SolicitudDeReapertura = { datasetId: evento.datasetId, pestana: pestanaDeAnalisis(evento.tipoEvento) };
    navigate(RUTAS.analisisDatos, { state: { reabrir: solicitud } });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Historial de análisis</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Los análisis que hiciste, del más reciente al más antiguo. Un mismo análisis consultado varias veces sobre el
            mismo dataset se anota una sola vez por sesión de trabajo.
          </p>
        </div>
        <button type="button" className={CLASE_BOTON_SECUNDARIO} disabled={exportar.isPending || total === 0} onClick={onExportar}>
          {exportar.isPending ? 'Exportando…' : 'Exportar a Excel'}
        </button>
      </div>

      {exportar.isError && <MensajeError mensaje={mensajeDeError(exportar.error)} />}
      {isLoading && <Spinner etiqueta="Cargando tu historial…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}

      {data && total === 0 && (
        <EstadoVacio
          mensaje={
            <>
              Todavía no hiciste ningún análisis. Empezá subiendo un archivo en{' '}
              <Link to={RUTAS.analisisDatos} className="underline">
                Análisis de Datos
              </Link>
              .
            </>
          }
        />
      )}

      {data && total > 0 && (
        <>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {total} análisis en total{totalDePaginas > 1 ? ` — mostrando ${eventos.length} por página` : ''}
          </p>
          <div className={`overflow-x-auto ${CLASE_TARJETA}`}>
            <table className="w-full text-left text-sm">
              <thead className={CLASE_CABECERA_DE_TABLA}>
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Dataset</th>
                  <th className="px-4 py-2">Tipo de análisis</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2">Reabrir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {eventos.map((evento) => {
                  const version = nombreDeVersion(evento.version);
                  const pantalla = PANTALLA_DEL_CATALOGO[evento.tipoEvento];
                  return (
                    <tr key={evento.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                        {new Date(evento.fechaHora).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {evento.dataset}
                        {version && <span className="font-normal text-slate-500 dark:text-slate-400"> ({version})</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{evento.tipoDeAnalisis}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{evento.detalle ?? '—'}</td>
                      <td className="px-4 py-2">
                        {evento.origen === 'dataset' && evento.datasetId && (
                          <button
                            type="button"
                            className={CLASE_BOTON_SECUNDARIO}
                            onClick={() => reabrirDataset(evento)}
                            aria-label={`Reabrir ${evento.tipoDeAnalisis} de ${evento.dataset}`}
                          >
                            Reabrir
                          </button>
                        )}
                        {evento.origen === 'catalogo' && pantalla && (
                          <Link to={pantalla} className={CLASE_BOTON_SECUNDARIO} aria-label={`Reabrir ${evento.tipoDeAnalisis}`}>
                            Reabrir
                          </Link>
                        )}
                        {!((evento.origen === 'dataset' && evento.datasetId) || (evento.origen === 'catalogo' && pantalla)) && (
                          <span className="text-xs text-slate-500 dark:text-slate-400" title="El dataset de este análisis no quedó guardado">
                            No disponible
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalDePaginas > 1 && (
            <nav className="flex items-center justify-between gap-4" aria-label="Páginas del historial">
              <button type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className={CLASE_BOTON_SECUNDARIO}>
                ← Más recientes
              </button>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Página {pagina + 1} de {totalDePaginas}
              </span>
              <button
                type="button"
                disabled={pagina >= totalDePaginas - 1}
                onClick={() => setPagina(pagina + 1)}
                className={CLASE_BOTON_SECUNDARIO}
              >
                Más antiguos →
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
