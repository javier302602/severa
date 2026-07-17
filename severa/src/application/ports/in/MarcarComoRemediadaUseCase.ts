import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface MarcarComoRemediadaUseCase {
  ejecutar(cve: string): Promise<Vulnerabilidad | null>;
}
