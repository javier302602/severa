import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface MarcarEnProcesoDeRemediacionUseCase {
  ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null>;
}
