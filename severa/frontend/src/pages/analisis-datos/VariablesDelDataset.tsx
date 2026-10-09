import { useCorregirTipoDeVariable } from '../../hooks/useAnalisisDatos';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import type { DiagnosticoColumna, DiagnosticoDeCalidad, TipoColumnaDetallado } from '../../api/analisisDatosService';
import { ETIQUETA_DE_TIPO_DETALLADO, ETIQUETA_DE_TIPO_GENERAL, TIPOS_DE_COLUMNA_DETALLADOS } from '../../constants/tiposDeVariable';
import { CLASE_SELECTOR, CLASE_TARJETA } from './estilos';

function etiquetaDeTipo(columna: DiagnosticoColumna): string {
  return columna.tipoDetallado ? ETIQUETA_DE_TIPO_DETALLADO[columna.tipoDetallado] : ETIQUETA_DE_TIPO_GENERAL[columna.tipo];
}

interface Props {
  sesionId: string;
  diagnostico: DiagnosticoDeCalidad;
  // false cuando la sesión no está asociada a un dataset guardado: no hay
  // dónde guardar la corrección, así que el tipo se muestra sin selector.
  puedeCorregir: boolean;
  onDiagnosticoActualizado: (diagnostico: DiagnosticoDeCalidad) => void;
}

// Las variables del dataset con su diagnóstico de calidad y, por cada una, el
// tipo con el que se la analiza.
//
// RF-111: el tipo lo detecta el sistema, pero el analista lo puede corregir
// (un código postal es un número y no una cantidad; una columna numérica con
// muchos "NA" se detecta como texto). El cambio vale para todos los análisis
// de las pestañas de abajo, que se vuelven a calcular solos.
export function VariablesDelDataset({ sesionId, diagnostico, puedeCorregir, onDiagnosticoActualizado }: Props) {
  const corregir = useCorregirTipoDeVariable(sesionId);

  const cambiarTipo = (columna: string, tipo: TipoColumnaDetallado | null) => {
    corregir.mutate({ columna, tipo }, { onSuccess: (resultado) => onDiagnosticoActualizado(resultado.diagnostico) });
  };

  return (
    <div className={`space-y-3 p-4 ${CLASE_TARJETA}`}>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {diagnostico.totalFilas} fila(s) — {diagnostico.columnas.length} columna(s) —{' '}
        {diagnostico.filasDuplicadas === 0 ? 'sin filas duplicadas' : `${diagnostico.filasDuplicadas} fila(s) duplicada(s)`}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-1">Columna</th>
              <th className="px-3 py-1">Tipo</th>
              <th className="px-3 py-1">Faltantes</th>
              <th className="px-3 py-1">% faltante</th>
              <th className="px-3 py-1">Únicos</th>
              <th className="px-3 py-1">Inconsistentes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {diagnostico.columnas.map((columna) => (
              <tr key={columna.nombre}>
                <td className="px-3 py-1 font-medium text-slate-900 dark:text-slate-100">{columna.nombre}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">
                  {puedeCorregir && columna.tipoDetallado ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Tipo de ${columna.nombre}`}
                        className={CLASE_SELECTOR}
                        value={columna.tipoDetallado}
                        disabled={corregir.isPending}
                        onChange={(evento) => cambiarTipo(columna.nombre, evento.target.value as TipoColumnaDetallado)}
                      >
                        {TIPOS_DE_COLUMNA_DETALLADOS.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {ETIQUETA_DE_TIPO_DETALLADO[tipo]}
                            {tipo === columna.tipoDetectado ? ' (detectado)' : ''}
                          </option>
                        ))}
                      </select>
                      {columna.tipoCorregidoManualmente && (
                        <>
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            corregido
                          </span>
                          <button
                            type="button"
                            disabled={corregir.isPending}
                            onClick={() => cambiarTipo(columna.nombre, null)}
                            className="text-xs text-slate-600 underline hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
                            aria-label={`Volver al tipo detectado de ${columna.nombre}`}
                          >
                            volver al detectado
                          </button>
                        </>
                      )}
                    </span>
                  ) : (
                    etiquetaDeTipo(columna)
                  )}
                </td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.valoresFaltantes}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.porcentajeFaltante.toFixed(1)}%</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.valoresUnicos}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.valoresInconsistentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {puedeCorregir && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          El tipo lo detecta el sistema a partir de los valores. Si alguno no es el correcto podés cambiarlo: todos los análisis
          de abajo se recalculan con el tipo que elijas, y el cambio queda anotado en la bitácora del dataset.
        </p>
      )}
      {corregir.isError && <MensajeError mensaje={mensajeDeError(corregir.error)} />}
    </div>
  );
}
