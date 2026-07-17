import { ResumenColumna } from '../../../domain/services/EstadisticasDescriptivasGenerico';

export interface CalcularEstadisticasDescriptivasGenericoUseCase {
  // analistaId viene siempre del token, nunca del body/query/params — ver
  // AnalisisDatasetController.ts. Si sesionId no existe/expiró/es de otro
  // analista, la implementación tira SesionAnalisisNoEncontradaError.
  ejecutar(analistaId: string, sesionId: string): Promise<ResumenColumna[]>;
}
