import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface GenerarDistribucionFrecuenciasUseCase {
  ejecutar(tipo: 'agrupada' | 'sinAgrupar', vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
