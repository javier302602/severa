import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface ConsultarVulnerabilidadPorCVEUseCase {
  ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null>;
}
