import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface CompararPorTipoAccesoUseCase {
  ejecutar(analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
