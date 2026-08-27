import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface MarcarComoRemediadaUseCase {
  ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null>;
}
