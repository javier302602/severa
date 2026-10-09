import {
  DecisionDeTratamiento,
  OperacionDeLimpiezaAplicada,
  PropuestaDeTratamiento
} from '../../../../domain/services/data-cleaning/TratamientoDeFaltantesGenerico';
import { EntradaDeBitacoraDeDataset } from '../../../../domain/entities/EntradaDeBitacoraDeDataset';
import { DatasetAbierto } from '../module_carga_gestion_datasets/DatasetsGenericosUseCases';

export interface PropuestaDeLimpieza {
  totalFilas: number;
  totalColumnas: number;
  // Una por cada variable con valores faltantes; vacío si no falta nada.
  propuestas: PropuestaDeTratamiento[];
}

// RF-120. analistaId siempre del token.
export interface ProponerTratamientoDeFaltantesUseCase {
  ejecutar(analistaId: string, sesionId: string): Promise<PropuestaDeLimpieza>;
}

// Qué haría (o hizo) una limpieza, sin las filas: es lo que se le muestra al
// analista antes de confirmar y lo que resume la notificación (RF-122).
export interface ResumenDeLimpieza {
  filasAntes: number;
  filasDespues: number;
  filasEliminadas: number;
  columnasEliminadas: string[];
  celdasImputadas: number;
  operaciones: OperacionDeLimpiezaAplicada[];
}

// El dataset NUEVO que generó la limpieza (RF-136/137) —otra versión de la
// misma familia, ya abierta en su propia sesión de análisis— y el resumen de
// lo que se hizo.
export interface ResultadoDeLimpiezaAplicada extends DatasetAbierto {
  // versionBase nunca es null acá: toda limpieza parte de alguna versión.
  versionBase: number;
  resumen: ResumenDeLimpieza;
}

export interface AplicarLimpiezaDeDatasetUseCase {
  // Calcula el efecto de las decisiones sin guardar nada.
  previsualizar(analistaId: string, sesionId: string, decisiones: DecisionDeTratamiento[]): Promise<ResumenDeLimpieza>;
  // RF-120: solo aplica con `confirmado === true`; cualquier otro valor es un
  // error, nunca un "sí" implícito.
  ejecutar(analistaId: string, sesionId: string, decisiones: DecisionDeTratamiento[], confirmado: boolean): Promise<ResultadoDeLimpiezaAplicada>;
}

// RF-123: la bitácora completa de la familia a la que pertenece el dataset.
export interface ConsultarBitacoraDeDatasetUseCase {
  ejecutar(analistaId: string, datasetId: string): Promise<EntradaDeBitacoraDeDataset[]>;
}
