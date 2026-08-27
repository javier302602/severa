import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface GenerarDistribucionFrecuenciasUseCase {
  ejecutar(tipo: 'agrupada' | 'sinAgrupar', analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown>;
}
