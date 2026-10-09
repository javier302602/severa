import { CriterioDeClasificacionValue } from '../shared/value-objects/CriterioDeClasificacion';
import { CorreccionesDeTipo } from '../services/variable-detection/DetectorDeTipoDeColumna';

// RF-136 (M-12) / RF-123 (M-15): lugar de un dataset dentro de su familia de
// versiones. El dataset tal como se cargó es la versión 0 y no tiene
// original; cada limpieza genera OTRO DatasetGenerico (con sus propios
// registros) que apunta a ese original, con el número de versión siguiente
// de la familia y la versión de la que partió.
export interface LinajeDeDataset {
  datasetOriginalId: string | null;
  version: number;
  versionBase: number | null;
}

export const LINAJE_DE_ORIGINAL: LinajeDeDataset = { datasetOriginalId: null, version: 0, versionBase: null };

// RF-110 (M-14): lo que el analista decidió sobre la variable objetivo. El
// sistema nunca escribe 'confirmada' por su cuenta: solo sugiere candidatas
// (ver VariableObjetivoGenerico.ts) y guarda acá la respuesta del analista.
export type DecisionVariableObjetivo =
  | { estado: 'pendiente'; columna: null }
  | { estado: 'rechazada'; columna: null }
  | { estado: 'confirmada'; columna: string };

export const VARIABLE_OBJETIVO_PENDIENTE: DecisionVariableObjetivo = { estado: 'pendiente', columna: null };

// Generalización de M-03 (RF-17/18/21/23, flujo persistido): a diferencia de
// Vulnerabilidad, no asume ninguna columna fija — `columnas` es la lista de
// nombres tal como vinieron en el archivo, y cada registro real vive aparte
// en RegistroDatasetGenerico. `preset` queda reservado para cuando el
// analista active el preset de ciberseguridad (Anexo D del SDS) sobre este
// mismo pipeline; por ahora siempre es null (nadie lo escribe todavía).
//
// `criterioClasificacion` (RF-139, M-09) y `columnaClave` (pendiente de M-03)
// se agregan juntos porque comparten la misma plomería (migración 012,
// PATCH /analisis-datos/:datasetId/criterio-clasificacion) aunque sean
// conceptos distintos: columnaClave identifica la fila, criterioClasificacion
// dice por qué valor se prioriza. Ambos null hasta que el analista los
// configure explícitamente — no hay default inventado.
//
// `hashOriginalSha256` (RF-135, M-12, migración 013): hash SHA-256 del
// archivo tal como se subió, calculado en AnalizarDatasetGenerico.ejecutar()
// ANTES de parsearlo — permite comprobar más adelante que un archivo
// (re-subido para comparar, ver VerificarIntegridadDataset.ts) es
// byte-a-byte el mismo que el original. SEVERA no conserva el archivo en sí
// (decisión confirmada: guardar blobs es una superficie de almacenamiento
// nueva sin precedente en este proyecto) — solo el hash, así que la
// verificación siempre requiere volver a aportar el archivo a comparar.
// null en datasets importados antes de esta migración (no hay forma honesta
// de calcular un hash retroactivo de un archivo que ya no existe en disco).
// Valor de `fuente` de un dataset que no vino de un archivo sino de
// transformar otro (ver derivarVersionProcesada).
export const FUENTE_DE_VERSION_PROCESADA = 'limpieza';

export class DatasetGenerico {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly nombreArchivo: string,
    public readonly columnas: string[],
    public readonly fuente: string,
    public readonly preset: string | null,
    public readonly filasDuplicadas: number,
    public readonly fechaCarga: Date = new Date(),
    public readonly criterioClasificacion: CriterioDeClasificacionValue | null = null,
    public readonly columnaClave: string | null = null,
    public readonly hashOriginalSha256: string | null = null,
    public readonly linaje: LinajeDeDataset = LINAJE_DE_ORIGINAL,
    // RF-111 (M-14): tipo de variable fijado a mano, por nombre de columna.
    public readonly tiposCorregidos: CorreccionesDeTipo = {},
    public readonly variableObjetivo: DecisionVariableObjetivo = VARIABLE_OBJETIVO_PENDIENTE,
    // null solo en un DatasetGenerico armado a mano sin ese dato (tests
    // anteriores a la migración 016); el repositorio siempre lo completa.
    public readonly totalFilas: number | null = null
  ) {}

  get esOriginal(): boolean {
    return this.linaje.datasetOriginalId === null;
  }

  // Id que identifica a toda la familia de versiones: el del original.
  get idDelOriginal(): string {
    return this.linaje.datasetOriginalId ?? this.id;
  }

  get version(): number {
    return this.linaje.version;
  }

  // Copia con otra configuración (criterio, tipos corregidos, variable
  // objetivo): lo único que se puede cambiar de un dataset ya cargado. Sus
  // columnas, sus filas y su linaje no tienen forma de cambiarse desde acá.
  conConfiguracion(cambios: {
    criterioClasificacion?: CriterioDeClasificacionValue | null;
    columnaClave?: string | null;
    tiposCorregidos?: CorreccionesDeTipo;
    variableObjetivo?: DecisionVariableObjetivo;
  }): DatasetGenerico {
    return new DatasetGenerico(
      this.id,
      this.analistaId,
      this.nombreArchivo,
      this.columnas,
      this.fuente,
      this.preset,
      this.filasDuplicadas,
      this.fechaCarga,
      cambios.criterioClasificacion !== undefined ? cambios.criterioClasificacion : this.criterioClasificacion,
      cambios.columnaClave !== undefined ? cambios.columnaClave : this.columnaClave,
      this.hashOriginalSha256,
      this.linaje,
      cambios.tiposCorregidos ?? this.tiposCorregidos,
      cambios.variableObjetivo ?? this.variableObjetivo,
      this.totalFilas
    );
  }

  // RF-136/137: el dataset que resulta de transformar este. Es OTRO dataset
  // (otro id, sus propios registros) de la misma familia; este no cambia.
  // Acá viven las reglas de qué se hereda, para que no dependan de quién lo
  // guarde:
  //   - nombre de archivo, preset: siempre.
  //   - criterio de clasificación, columna clave y variable objetivo: solo si
  //     la columna a la que refieren sigue existiendo. Si la limpieza eliminó
  //     la variable objetivo, la decisión vuelve a "pendiente" — no se puede
  //     dar por confirmada una variable que ya no está.
  //   - hash del archivo: no. Es del archivo original (RF-135); una versión
  //     procesada no tiene archivo propio contra el cual verificarlo.
  // `version` lo asigna quien persiste, que es quien puede garantizar que no
  // se repita (ver crearVersionProcesada en el repositorio).
  derivarVersionProcesada(datos: {
    id: string;
    version: number;
    columnas: string[];
    totalFilas: number;
    filasDuplicadas: number;
    tiposCorregidos: CorreccionesDeTipo;
    fecha: Date;
  }): DatasetGenerico {
    const sigue = (columna: string | null): boolean => columna !== null && datos.columnas.includes(columna);

    return new DatasetGenerico(
      datos.id,
      this.analistaId,
      this.nombreArchivo,
      datos.columnas,
      FUENTE_DE_VERSION_PROCESADA,
      this.preset,
      datos.filasDuplicadas,
      datos.fecha,
      this.criterioClasificacion && sigue(this.criterioClasificacion.nombreColumna) ? this.criterioClasificacion : null,
      sigue(this.columnaClave) ? this.columnaClave : null,
      null,
      { datasetOriginalId: this.idDelOriginal, version: datos.version, versionBase: this.version },
      datos.tiposCorregidos,
      this.variableObjetivo.estado === 'confirmada' && !sigue(this.variableObjetivo.columna) ? VARIABLE_OBJETIVO_PENDIENTE : this.variableObjetivo,
      datos.totalFilas
    );
  }
}
