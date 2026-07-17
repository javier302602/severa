import { Link, useParams } from 'react-router-dom';
import { useVulnerabilidad } from '../../hooks/useVulnerabilidad';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

export function VulnerabilidadDetallePage() {
  const { cve } = useParams<{ cve: string }>();
  const { data, isLoading, isError, error } = useVulnerabilidad(cve ?? '');

  return (
    <div className="max-w-xl space-y-4">
      <Link to={RUTAS.catalogo} className="text-sm text-slate-600 dark:text-slate-400 underline">
        ← Volver al catálogo
      </Link>

      {isLoading && <Spinner etiqueta="Cargando vulnerabilidad…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}

      {data && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{data.cve}</h1>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-600 dark:text-slate-400">Software</dt>
            <dd className="text-slate-900 dark:text-slate-100">{data.software}</dd>
            <dt className="text-slate-600 dark:text-slate-400">CVSS Score</dt>
            <dd className="text-slate-900 dark:text-slate-100">{data.cvssScore.toFixed(1)}</dd>
            <dt className="text-slate-600 dark:text-slate-400">Tipo de acceso</dt>
            <dd className="text-slate-900 dark:text-slate-100">{data.tipoAcceso}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
