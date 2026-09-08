import { ResumenColumna } from '../../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';

export interface CalcularEstadisticasDescriptivasGenericoUseCase {
  // analistaId viene siempre del token, nunca del body/query/params — ver
  // AnalisisDatasetController.ts. Si sesionId no existe/expiró/es de otro
  // analista, la implementación tira SesionAnalisisNoEncontradaError.
  // RF-109 (M-14): incluirIdentificadores, default false — las columnas que
  // DetectorDeTipoDeColumna marca como 'identificador' (cardinalidad casi
  // única) se excluyen del análisis estadístico por defecto; el analista
  // las puede pedir explícitamente con este flag.
  ejecutar(analistaId: string, sesionId: string, incluirIdentificadores?: boolean): Promise<ResumenColumna[]>;
}
