import { DiagnosticoDataset } from '../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { ResumenColumna } from '../../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { CorreccionesDeTipo } from '../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { DecisionVariableObjetivo } from '../../../../domain/entities/DatasetGenerico';
import { OperacionDeBitacora } from '../../../../domain/entities/EntradaDeBitacoraDeDataset';

// Un dataset (el original o una versión procesada) listo para analizar: sus
// filas ya están en una sesión de análisis. Es lo que devuelven abrir un
// dataset guardado y aplicar una limpieza, y tiene la misma información que
// la respuesta de la carga inicial, para que la pantalla trate los tres casos
// igual.
export interface DatasetAbierto {
  sesionId: string;
  datasetId: string;
  // Id del original: identifica a toda la familia de versiones.
  datasetOriginalId: string;
  nombreArchivo: string;
  version: number;
  // De qué versión partió. null en el original.
  versionBase: number | null;
  diagnostico: DiagnosticoDataset;
  perfilVariables: ResumenColumna[];
  tiposCorregidos: CorreccionesDeTipo;
  variableObjetivo: DecisionVariableObjetivo;
}

export interface OperacionDeVersion {
  operacion: OperacionDeBitacora;
  variable: string | null;
  metodo: string;
  registrosAfectados: number;
}

// RF-136: una versión dentro de su familia.
export interface ResumenDeVersion {
  datasetId: string;
  version: number;
  versionBase: number | null;
  esOriginal: boolean;
  fecha: Date;
  totalFilas: number | null;
  totalColumnas: number;
  // Las operaciones de limpieza que produjeron esta versión (vacío en el
  // original).
  operaciones: OperacionDeVersion[];
}

// Un dataset cargado por el analista, con cuántas versiones procesadas tiene.
export interface ResumenDeDataset {
  datasetOriginalId: string;
  nombreArchivo: string;
  fechaCarga: Date;
  totalFilas: number | null;
  totalColumnas: number;
  versionesProcesadas: number;
  // La versión más reciente de la familia (el propio original si no hay otra).
  ultimaVersion: { datasetId: string; version: number; fecha: Date };
}

// analistaId siempre del token en los tres.
export interface ListarDatasetsGenericosUseCase {
  ejecutar(analistaId: string): Promise<ResumenDeDataset[]>;
}

// RF-136: "el analista puede consultar ... versiones anteriores". Acepta el
// id del original o el de cualquier versión; responde la familia completa.
export interface ListarVersionesDeDatasetUseCase {
  ejecutar(analistaId: string, datasetId: string): Promise<ResumenDeVersion[]>;
}

// RF-136: "... y recuperar versiones anteriores". Abre el dataset indicado
// (el original o una versión) en una sesión de análisis nueva. No modifica
// nada: recuperar una versión es volver a trabajar sobre ella.
export interface AbrirDatasetGenericoUseCase {
  ejecutar(analistaId: string, datasetId: string): Promise<DatasetAbierto>;
}
