import { useDatasetsGuardados } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { CLASE_BOTON_SECUNDARIO, CLASE_CABECERA_DE_TABLA, CLASE_TARJETA } from './estilos';

interface Props {
  abriendo: boolean;
  onAbrir: (datasetId: string) => void;
}

// RF-136: los datasets que el analista ya cargó. Cada archivo analizado queda
// guardado con sus versiones, así que no hace falta volver a subirlo para
// seguir trabajando: se abre desde acá, el original o su última versión.
export function MisDatasets({ abriendo, onAbrir }: Props) {
  const { data, isLoading, isError, error } = useDatasetsGuardados();

  if (isLoading) return <Spinner etiqueta="Cargando tus datasets…" />;
  if (isError) return <MensajeError mensaje={mensajeDeError(error)} />;
  if (!data || data.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mis datasets</h2>
      <div className={`overflow-x-auto ${CLASE_TARJETA}`}>
        <table className="w-full text-left text-sm">
          <thead className={CLASE_CABECERA_DE_TABLA}>
            <tr>
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Cargado</th>
              <th className="px-4 py-2">Filas × columnas</th>
              <th className="px-4 py-2">Versiones procesadas</th>
              <th className="px-4 py-2">Abrir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.map((dataset) => (
              <tr key={dataset.datasetOriginalId}>
                <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{dataset.nombreArchivo}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                  {new Date(dataset.fechaCarga).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                  {dataset.totalFilas ?? '—'} × {dataset.totalColumnas}
                </td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{dataset.versionesProcesadas}</td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={CLASE_BOTON_SECUNDARIO}
                      disabled={abriendo}
                      onClick={() => onAbrir(dataset.datasetOriginalId)}
                      aria-label={`Abrir el original de ${dataset.nombreArchivo}`}
                    >
                      Original
                    </button>
                    {dataset.versionesProcesadas > 0 && (
                      <button
                        type="button"
                        className={CLASE_BOTON_SECUNDARIO}
                        disabled={abriendo}
                        onClick={() => onAbrir(dataset.ultimaVersion.datasetId)}
                        aria-label={`Abrir la versión ${dataset.ultimaVersion.version} de ${dataset.nombreArchivo}`}
                      >
                        Versión {dataset.ultimaVersion.version}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
