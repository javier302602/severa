import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface MarcarEnProcesoDeRemediacionUseCase {
  ejecutar(cve: string): Promise<Vulnerabilidad | null>;
}
