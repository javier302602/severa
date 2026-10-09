import { ConfiguracionDePlantilla, columnasMencionadasPor } from '../../entities/PlantillaDeAnalisis';
import { DecisionVariableObjetivo } from '../../entities/DatasetGenerico';
import { CriterioDeClasificacionJSON, CriterioDeClasificacionValue } from '../../shared/value-objects/CriterioDeClasificacion';
import {
  CorreccionesDeTipo,
  ETIQUETA_DE_TIPO_DETALLADO,
  TipoColumnaDetallado,
  esVacio,
  motivoDeTipoNoAplicable,
  resolverTipoColumna,
  resolverTipoColumnaDetallado
} from '../variable-detection/DetectorDeTipoDeColumna';
import { esAptaComoVariableObjetivo } from '../variable-detection/VariableObjetivoGenerico';
import { construirCriterioParaColumna } from '../classification/ValidacionDeCriterioDeClasificacion';
import { ColumnaDeDatasetInvalidaError } from '../../errors/ColumnaDeDatasetInvalidaError';

// El dataset sobre el que se quiere aplicar la plantilla, tal como está ahora.
export interface DatasetParaPlantilla {
  columnas: string[];
  filas: Array<Record<string, unknown>>;
  tiposCorregidos: CorreccionesDeTipo;
  variableObjetivo: DecisionVariableObjetivo;
  criterioClasificacion: CriterioDeClasificacionValue | null;
  columnaClave: string | null;
}

export type CambioDePlantilla =
  | { tipo: 'tipo_de_variable'; columna: string; tipoActual: TipoColumnaDetallado; tipoNuevo: TipoColumnaDetallado }
  | { tipo: 'variable_objetivo'; columna: string; actual: DecisionVariableObjetivo }
  | {
      tipo: 'criterio_de_clasificacion';
      criterioActual: CriterioDeClasificacionJSON | null;
      criterioNuevo: CriterioDeClasificacionJSON;
      columnaClaveActual: string | null;
      columnaClaveNueva: string | null;
      // Solo en un criterio ordinal: valores de la columna que el orden de la
      // plantilla no menciona. Esas filas quedarían "Sin clasificar".
      categoriasSinOrden: string[];
    };

export interface PlanDeAplicacionDePlantilla {
  // Columnas que la plantilla menciona y el dataset no tiene.
  columnasFaltantes: string[];
  // Lo que la plantilla trae y no se puede aplicar con estos datos.
  problemas: string[];
  // Lo que todavía falta aplicar, en el orden en que se aplica: tipos,
  // variable objetivo, criterio. Lo que el dataset ya tiene no aparece: así,
  // si una aplicación anterior se cortó, el plan muestra solo lo que quedó
  // pendiente.
  cambios: CambioDePlantilla[];
  // Cuántos de los ajustes de la plantilla ya estaban vigentes.
  yaVigentes: number;
  aplicable: boolean;
}

// RF-12: qué pasaría si se aplica esta configuración sobre este dataset. No
// cambia nada; quien aplica de verdad (AplicarPlantillaDeAnalisis) vuelve a
// calcular el plan antes de escribir y no escribe nada si no es aplicable.
//
// Reglas (confirmadas con el dueño del producto):
//   - Compatible = el dataset tiene todas las columnas que la plantilla
//     menciona. Si falta alguna, no se evalúa nada más.
//   - La plantilla solo agrega o cambia lo que trae: no toca correcciones de
//     columnas que no menciona, y si no trae variable objetivo o criterio deja
//     los que haya.
//   - La variable objetivo y el criterio se validan contra los tipos tal como
//     quedarían DESPUÉS de aplicar los tipos de la plantilla, porque ese es el
//     orden en que se aplican.
export function planificarAplicacionDePlantilla(
  configuracion: ConfiguracionDePlantilla,
  dataset: DatasetParaPlantilla
): PlanDeAplicacionDePlantilla {
  const mencionadas = columnasMencionadasPor(configuracion);
  const columnasFaltantes = mencionadas.filter((columna) => !dataset.columnas.includes(columna));
  if (columnasFaltantes.length > 0) {
    return { columnasFaltantes, problemas: [], cambios: [], yaVigentes: 0, aplicable: false };
  }

  const valoresDe = (columna: string): unknown[] => dataset.filas.map((fila) => fila[columna]);
  const problemas: string[] = [];
  const cambios: CambioDePlantilla[] = [];
  let yaVigentes = 0;

  // 1. Tipos, en el orden de las columnas del dataset.
  const tiposDespues: Record<string, TipoColumnaDetallado> = { ...dataset.tiposCorregidos };
  const columnasConTipo = dataset.columnas.filter((columna) =>
    Object.prototype.hasOwnProperty.call(configuracion.tiposCorregidos, columna)
  );
  for (const columna of columnasConTipo) {
    const tipoNuevo = configuracion.tiposCorregidos[columna];
    const valores = valoresDe(columna);
    const motivo = motivoDeTipoNoAplicable(tipoNuevo, valores);
    if (motivo !== null) {
      problemas.push(`no se puede tratar "${columna}" como ${ETIQUETA_DE_TIPO_DETALLADO[tipoNuevo]}: ${motivo}`);
      continue;
    }
    tiposDespues[columna] = tipoNuevo;
    const tipoActual = resolverTipoColumnaDetallado(columna, valores, dataset.tiposCorregidos);
    if (tipoActual === tipoNuevo) {
      yaVigentes++;
    } else {
      cambios.push({ tipo: 'tipo_de_variable', columna, tipoActual, tipoNuevo });
    }
  }

  // 2. Variable objetivo (RF-110): la plantilla la propone, el analista la
  //    confirma al confirmar la aplicación.
  const objetivo = configuracion.variableObjetivo;
  if (objetivo !== null) {
    const tipo = resolverTipoColumnaDetallado(objetivo, valoresDe(objetivo), tiposDespues);
    if (!esAptaComoVariableObjetivo(tipo)) {
      problemas.push(
        `"${objetivo}" no puede ser variable objetivo en este dataset: quedaría como ${ETIQUETA_DE_TIPO_DETALLADO[tipo]}`
      );
    } else if (dataset.variableObjetivo.estado === 'confirmada' && dataset.variableObjetivo.columna === objetivo) {
      yaVigentes++;
    } else {
      cambios.push({ tipo: 'variable_objetivo', columna: objetivo, actual: dataset.variableObjetivo });
    }
  }

  // 3. Criterio de clasificación (RF-139) y su columna clave.
  const clasificacion = configuracion.clasificacion;
  if (clasificacion !== null) {
    const { nombreColumna } = clasificacion.criterio;
    const valores = valoresDe(nombreColumna);
    try {
      const criterio = construirCriterioParaColumna(clasificacion.criterio, resolverTipoColumna(nombreColumna, valores, tiposDespues));
      // Sin columna clave en la plantilla se conserva la que haya (igual que
      // ConfigurarCriterioDeClasificacion cuando no se le manda una).
      const columnaClaveNueva = clasificacion.columnaClave ?? dataset.columnaClave;
      if (criterio.esIgualA(dataset.criterioClasificacion) && columnaClaveNueva === dataset.columnaClave) {
        yaVigentes++;
      } else {
        cambios.push({
          tipo: 'criterio_de_clasificacion',
          criterioActual: dataset.criterioClasificacion?.toJSON() ?? null,
          criterioNuevo: criterio.toJSON(),
          columnaClaveActual: dataset.columnaClave,
          columnaClaveNueva,
          categoriasSinOrden: criterio.tipo === 'ordinal' ? categoriasSinOrden(valores, criterio.ordenCategorias ?? []) : []
        });
      }
    } catch (error) {
      if (!(error instanceof ColumnaDeDatasetInvalidaError)) throw error;
      problemas.push(`el criterio de clasificación no sirve para este dataset: ${error.message}`);
    }
  }

  const aplicable = problemas.length === 0;
  return { columnasFaltantes: [], problemas, cambios: aplicable ? cambios : [], yaVigentes: aplicable ? yaVigentes : 0, aplicable };
}

// Valores distintos (como texto, igual que los compara
// CriterioDeClasificacionValue.clasificar) que el orden no incluye, en el
// orden en que aparecen en el dataset.
function categoriasSinOrden(valores: unknown[], orden: string[]): string[] {
  const conocidas = new Set(orden);
  const faltantes = new Set<string>();
  for (const valor of valores) {
    if (esVacio(valor)) continue;
    const texto = String(valor);
    if (!conocidas.has(texto)) faltantes.add(texto);
  }
  return [...faltantes];
}
