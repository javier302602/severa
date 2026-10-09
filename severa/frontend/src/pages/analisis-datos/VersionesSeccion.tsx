import { useBitacoraDeDataset, useExportarDataset, useVersionesDeDataset } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { descargarArchivo } from '../../utils/descargarArchivo';
import type { EntradaDeBitacora, ResumenDeVersion } from '../../api/analisisDatosService';
import { ETIQUETA_DE_OPERACION, nombreDeVersion } from '../../constants/tiposDeVariable';
import { CLASE_BOTON_SECUNDARIO, CLASE_CABECERA_DE_TABLA, CLASE_TARJETA } from './estilos';

function fechaYHora(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString();
}

function resumenDeOperaciones(version: ResumenDeVersion): string {
  if (version.esOriginal) return 'El archivo tal como se cargó';
  if (version.operaciones.length === 0) return '—';
  return version.operaciones
    .map((operacion) => `${ETIQUETA_DE_OPERACION[operacion.operacion]} de ${operacion.variable ?? '—'} (${operacion.metodo})`)
    .join('; ');
}

// A qué versión se refiere una entrada de la bitácora: las limpiezas van de
// una versión a otra; corregir un tipo o definir la variable objetivo se
// hacen SOBRE una versión, sin generar otra.
function versionDeLaEntrada(entrada: EntradaDeBitacora): string {
  const origen = nombreDeVersion(entrada.versionOrigen).toLowerCase();
  return entrada.versionResultado === null ? `sobre ${origen}` : `de ${origen} a versión ${entrada.versionResultado}`;
}

function detalleDeLaEntrada(entrada: EntradaDeBitacora): string {
  const valor = entrada.detalle.valorImputado;
  if (typeof valor === 'number') return `${entrada.metodo} (valor: ${Number(valor.toFixed(4))})`;
  if (typeof valor === 'string' || typeof valor === 'boolean') return `${entrada.metodo} (valor: ${String(valor)})`;
  return entrada.metodo;
}

interface Props {
  // El dataset abierto: sirve el id del original o el de cualquier versión.
  datasetId: string;
  nombreArchivo: string;
  abriendo: boolean;
  onAbrir: (datasetId: string) => void;
}

// RF-136: las versiones numeradas del dataset — consultarlas, volver a abrir
// cualquiera (también el original) y exportarla. RF-123: la bitácora con todo
// lo que se le hizo, operación por operación.
export function VersionesSeccion({ datasetId, nombreArchivo, abriendo, onAbrir }: Props) {
  const versiones = useVersionesDeDataset(datasetId);
  const bitacora = useBitacoraDeDataset(datasetId);
  const exportar = useExportarDataset();

  const onExportar = (version: ResumenDeVersion) => {
    const base = nombreArchivo.replace(/\.[^.]+$/, '');
    const sufijo = version.esOriginal ? 'original' : `version-${version.version}`;
    exportar.mutate(version.datasetId, { onSuccess: (blob) => descargarArchivo(blob, `${base}-${sufijo}.xlsx`) });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Versiones</h3>
        {versiones.isLoading && <Spinner etiqueta="Cargando versiones…" />}
        {versiones.isError && <MensajeError mensaje={mensajeDeError(versiones.error)} />}
        {versiones.data && (
          <div className={`overflow-x-auto ${CLASE_TARJETA}`}>
            <table className="w-full text-left text-sm">
              <thead className={CLASE_CABECERA_DE_TABLA}>
                <tr>
                  <th className="px-4 py-2">Versión</th>
                  <th className="px-4 py-2">Generada desde</th>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Filas × columnas</th>
                  <th className="px-4 py-2">Qué se hizo</th>
                  <th className="px-4 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {versiones.data.map((version) => {
                  const esLaAbierta = version.datasetId === datasetId;
                  return (
                    <tr key={version.datasetId} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {nombreDeVersion(version.version)}
                        {esLaAbierta && <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">(abierta)</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                        {version.versionBase === null ? '—' : nombreDeVersion(version.versionBase)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">{fechaYHora(version.fecha)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                        {version.totalFilas ?? '—'} × {version.totalColumnas}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{resumenDeOperaciones(version)}</td>
                      <td className="px-4 py-2">
                        <span className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={CLASE_BOTON_SECUNDARIO}
                            disabled={esLaAbierta || abriendo}
                            onClick={() => onAbrir(version.datasetId)}
                            aria-label={`Abrir ${nombreDeVersion(version.version).toLowerCase()}`}
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            className={CLASE_BOTON_SECUNDARIO}
                            disabled={exportar.isPending}
                            onClick={() => onExportar(version)}
                            aria-label={`Exportar ${nombreDeVersion(version.version).toLowerCase()} a Excel`}
                          >
                            Exportar
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {exportar.isError && <MensajeError mensaje={mensajeDeError(exportar.error)} />}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cada limpieza genera una versión nueva; ninguna versión se modifica después de creada. Abrir una versión anterior no
          borra las posteriores.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bitácora</h3>
        {bitacora.isLoading && <Spinner etiqueta="Cargando la bitácora…" />}
        {bitacora.isError && <MensajeError mensaje={mensajeDeError(bitacora.error)} />}
        {bitacora.data && bitacora.data.length === 0 && (
          <EstadoVacio mensaje="Todavía no se hizo ninguna operación sobre este dataset." />
        )}
        {bitacora.data && bitacora.data.length > 0 && (
          <div className={`overflow-x-auto ${CLASE_TARJETA}`}>
            <table className="w-full text-left text-sm">
              <thead className={CLASE_CABECERA_DE_TABLA}>
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Usuario</th>
                  <th className="px-4 py-2">Operación</th>
                  <th className="px-4 py-2">Variable</th>
                  <th className="px-4 py-2">Registros</th>
                  <th className="px-4 py-2">Método</th>
                  <th className="px-4 py-2">Versión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {bitacora.data.map((entrada) => (
                  <tr key={entrada.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">{fechaYHora(entrada.fecha)}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{entrada.nombreAnalista ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{ETIQUETA_DE_OPERACION[entrada.operacion]}</td>
                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{entrada.variable ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{entrada.registrosAfectados}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{detalleDeLaEntrada(entrada)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">{versionDeLaEntrada(entrada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
