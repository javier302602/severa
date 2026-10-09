import { useState } from 'react';
import { useAuditoria } from '../../hooks/useAuditoria';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';

// M-12 (RF-91 a RF-98). El Sidebar ya oculta esta entrada para analistas sin
// rol administrador (Sidebar.tsx) — pura conveniencia de UI, la protección
// real es requiereRol('administrador') en el backend (RolMiddleware.ts). Si
// de todos modos se llega acá sin ese rol (link directo, back del browser),
// el 403 del backend cae en el mismo MensajeError genérico de abajo.
//
// RF-138: "el administrador puede consultar la auditoría completa de un
// dataset específico". Cada registro hecho sobre un dataset trae su id, y un
// clic en "ver solo este dataset" filtra el historial por él.
export function AuditoriaPage() {
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const { data, isLoading, isError, error } = useAuditoria(datasetId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Auditoría</h1>

      {datasetId && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
          <span>
            Mostrando solo las operaciones sobre el dataset <code className="font-mono">{datasetId}</code> (incluye todas sus versiones).
          </span>
          <button type="button" onClick={() => setDatasetId(null)} className="rounded-md px-2 py-1 text-xs font-medium ring-1 ring-sky-300 hover:bg-sky-100 dark:ring-sky-800 dark:hover:bg-sky-900/40">
            Ver todo el historial
          </button>
        </div>
      )}

      {isLoading && <Spinner etiqueta="Cargando historial de auditoría…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && data.length === 0 && (
        <EstadoVacio mensaje={datasetId ? 'No hay operaciones auditadas sobre ese dataset.' : 'Todavía no hay registros de auditoría.'} />
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Fecha y hora</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Acción</th>
                <th className="px-4 py-2">Detalle</th>
                <th className="px-4 py-2">Dataset</th>
              </tr>
            </thead>
            <tbody>
              {data.map((registro) => (
                <tr key={registro.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">{new Date(registro.fechaHora).toLocaleString()}</td>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{registro.usuario}</td>
                  <td className="px-4 py-2">{registro.accion}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{registro.detalle}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                    {registro.datasetId && registro.datasetId !== datasetId ? (
                      <button
                        type="button"
                        onClick={() => setDatasetId(registro.datasetId ?? null)}
                        className="text-xs underline hover:text-slate-900 dark:hover:text-slate-200"
                        aria-label={`Ver solo la auditoría del dataset ${registro.datasetId}`}
                      >
                        ver solo este dataset
                      </button>
                    ) : (
                      (registro.datasetId && <span className="text-xs">este dataset</span>) || '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
