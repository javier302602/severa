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
export function AuditoriaPage() {
  const { data, isLoading, isError, error } = useAuditoria();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Auditoría</h1>

      {isLoading && <Spinner etiqueta="Cargando historial de auditoría…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && data.length === 0 && <EstadoVacio mensaje="Todavía no hay registros de auditoría." />}

      {data && data.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Fecha y hora</th>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Acción</th>
              <th className="px-4 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {data.map((registro) => (
              <tr key={registro.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">{new Date(registro.fechaHora).toLocaleString()}</td>
                <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{registro.usuario}</td>
                <td className="px-4 py-2">{registro.accion}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{registro.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
