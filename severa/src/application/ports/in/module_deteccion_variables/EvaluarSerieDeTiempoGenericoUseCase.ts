import { EvaluacionDeSerieDeTiempo } from '../../../../domain/services/variable-detection/SerieDeTiempoGenerico';

// RF-108. analistaId siempre del token.
export interface EvaluarSerieDeTiempoGenericoUseCase {
  ejecutar(analistaId: string, sesionId: string): Promise<EvaluacionDeSerieDeTiempo>;
}
