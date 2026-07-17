import { Link } from 'react-router-dom';
import { useResumenEstadistico } from '../../hooks/useEstadisticas';
import type { ResumenEstadistico } from '../../api/estadisticaService';
import { PestanasEstadisticas } from './PestanasEstadisticas';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

const ETIQUETAS: Array<{ clave: Exclude<keyof ResumenEstadistico, 'moda'>; etiqueta: string }> = [
  { clave: 'media', etiqueta: 'Media' },
  { clave: 'mediana', etiqueta: 'Mediana' },
  { clave: 'q1', etiqueta: 'Q1' },
  { clave: 'q3', etiqueta: 'Q3' },
  { clave: 'rango', etiqueta: 'Rango' },
  { clave: 'varianza', etiqueta: 'Varianza' },
  { clave: 'desviacionEstandar', etiqueta: 'Desviación estándar' },
  { clave: 'coeficienteVariacion', etiqueta: 'Coef. de variación (%)' }
];

export function ResumenEstadisticoPage() {
  const { data, isLoading, isError, error } = useResumenEstadistico();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Estadísticas</h1>
      <PestanasEstadisticas />

      {isLoading && <Spinner etiqueta="Calculando…" />}

      {isError && esCatalogoVacio(error) && (
        <EstadoVacio
          mensaje={
            <>
              Todavía no hay vulnerabilidades cargadas.{' '}
              <Link to={RUTAS.dataset} className="underline">
                Importá un dataset
              </Link>{' '}
              para ver estadísticas.
            </>
          }
        />
      )}
      {isError && !esCatalogoVacio(error) && <MensajeError mensaje={mensajeDeError(error)} />}

      {data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {ETIQUETAS.map(({ clave, etiqueta }) => (
            <div key={clave} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">{etiqueta}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{data[clave].toFixed(2)}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4 md:col-span-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Moda</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{data.moda.map((valor) => valor.toFixed(1)).join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
