import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface CompararPorTipoAccesoUseCase {
  ejecutar(vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
