import { ResultadoDeteccionOutliers } from '../../../domain/services/DeteccionOutliersGenerico';

export interface DetectarOutliersGenericoUseCase {
  // Mismo criterio: analistaId siempre del token.
  ejecutar(analistaId: string, sesionId: string): Promise<ResultadoDeteccionOutliers>;
}
