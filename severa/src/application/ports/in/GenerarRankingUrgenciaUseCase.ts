import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { EntradaRanking } from '../../../domain/services/MotorDePriorizacion';

export interface GenerarRankingUrgenciaUseCase {
  // analistaId es quién solicita el ranking (RF-76, Sprint 14): si se provee,
  // las alertas de plazo excedido que dispare esta llamada quedan asociadas a
  // su centro de notificaciones, además de ir a consola.
  ejecutar(vulnerabilidades?: Vulnerabilidad[], analistaId?: string): Promise<EntradaRanking[]>;
}
