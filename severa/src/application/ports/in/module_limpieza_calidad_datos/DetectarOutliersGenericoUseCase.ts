import { ResultadoDeteccionOutliers } from '../../../../domain/services/data-cleaning/DeteccionOutliersGenerico';

export interface DetectarOutliersGenericoUseCase {
  // Mismo criterio: analistaId siempre del token.
  ejecutar(analistaId: string, sesionId: string): Promise<ResultadoDeteccionOutliers>;
}
