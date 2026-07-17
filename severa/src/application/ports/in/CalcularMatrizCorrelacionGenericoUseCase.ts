import { MatrizCorrelacion } from '../../../domain/services/CorrelacionGenerico';

export interface CalcularMatrizCorrelacionGenericoUseCase {
  // analistaId siempre del token, nunca del body/query/params — mismo
  // criterio IDOR que el resto de las rutas de Fase 3/4 sobre sesionId.
  ejecutar(analistaId: string, sesionId: string): Promise<MatrizCorrelacion>;
}
