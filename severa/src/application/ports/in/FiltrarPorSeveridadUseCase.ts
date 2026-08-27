import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface FiltrarPorSeveridadUseCase {
  ejecutar(severidad: string, analistaId: string): Promise<Vulnerabilidad[]>;
}
