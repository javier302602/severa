import { useSerieDeTiempo } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import type { EvaluacionDeColumnaTemporal, ViabilidadDeSerie } from '../../api/analisisDatosService';
import { CLASE_AVISO_DE_EXITO, CLASE_AVISO_INFORMATIVO, CLASE_CABECERA_DE_TABLA, CLASE_TARJETA } from './estilos';

const ETIQUETA_DE_VIABILIDAD: Record<ViabilidadDeSerie, string> = {
  directa: 'Sí, directamente',
  requiere_agregacion: 'Sí, agrupando por período',
  no_viable: 'No'
};

const ETIQUETA_DE_FRECUENCIA: Record<string, string> = {
  por_segundo: 'Por segundo',
  por_minuto: 'Por minuto',
  horaria: 'Horaria',
  diaria: 'Diaria',
  diaria_habil: 'Diaria (días hábiles)',
  semanal: 'Semanal',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual'
};

// Las fechas llegan en ISO 8601 (UTC). Se muestran como están en los datos
// —sin convertir a la zona horaria del navegador— para que el día que ve el
// analista sea el mismo que figura en su archivo.
function instanteLegible(iso: string | null, conHora: boolean): string {
  if (!iso) return '—';
  const [dia, hora = ''] = iso.split('T');
  const [anio, mes, numero] = dia.split('-');
  const fecha = `${numero}/${mes}/${anio}`;
  return conHora ? `${fecha} ${hora.slice(0, 5)}` : fecha;
}

function FilaDeColumnaTemporal({ columna }: { columna: EvaluacionDeColumnaTemporal }) {
  const conHora = columna.tipo === 'fecha_hora';
  return (
    <>
      <tr>
        <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{columna.columna}</td>
        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
          {instanteLegible(columna.desde, conHora)} — {instanteLegible(columna.hasta, conHora)}
        </td>
        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
          {columna.frecuencia ? (ETIQUETA_DE_FRECUENCIA[columna.frecuencia] ?? columna.frecuencia) : 'Sin frecuencia regular'}
        </td>
        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
          {columna.periodosConDatos} con datos, {columna.periodosFaltantes} sin datos ({(columna.cobertura * 100).toFixed(1)}%)
        </td>
        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{ETIQUETA_DE_VIABILIDAD[columna.viabilidad]}</td>
      </tr>
      <tr>
        <td colSpan={5} className="px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
          {columna.motivo}
        </td>
      </tr>
    </>
  );
}

// RF-108: ¿este dataset se puede tratar como una serie de tiempo? El sistema
// identifica las columnas de fecha, mide qué tan regular es su frecuencia y
// lo informa con los números que usó. No pronostica nada.
export function SerieDeTiempoSeccion({ sesionId, onReiniciar }: { sesionId: string; onReiniciar: () => void }) {
  const { data, isLoading, isError, error } = useSerieDeTiempo(sesionId);

  if (isLoading) return <Spinner etiqueta="Evaluando la estructura temporal…" />;
  if (isError) return <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className={data.esViableComoSerieDeTiempo ? CLASE_AVISO_DE_EXITO : CLASE_AVISO_INFORMATIVO} role="status">
        {data.resumen}
      </p>

      {data.columnasTemporales.length > 0 && (
        <div className={`overflow-x-auto ${CLASE_TARJETA}`}>
          <table className="w-full text-left text-sm">
            <thead className={CLASE_CABECERA_DE_TABLA}>
              <tr>
                <th className="px-4 py-2">Columna temporal</th>
                <th className="px-4 py-2">Rango</th>
                <th className="px-4 py-2">Frecuencia</th>
                <th className="px-4 py-2">Períodos</th>
                <th className="px-4 py-2">¿Serie de tiempo?</th>
              </tr>
            </thead>
            <tbody>
              {data.columnasTemporales.map((columna) => (
                <FilaDeColumnaTemporal key={columna.columna} columna={columna} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.esViableComoSerieDeTiempo && data.variablesNumericas.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Variables numéricas que se podrían observar a lo largo del tiempo:{' '}
          <span className="font-medium text-slate-900 dark:text-slate-100">{data.variablesNumericas.join(', ')}</span>.
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Se considera regular una frecuencia cuando al menos el 80% de los períodos entre la primera y la última fecha tiene
        datos, con un mínimo de 8 períodos. Son criterios orientativos: los números de cada columna están a la vista para que
        puedas evaluarlo vos. Esta pantalla describe la estructura temporal de los datos; SIADE no hace pronósticos.
      </p>
    </div>
  );
}
