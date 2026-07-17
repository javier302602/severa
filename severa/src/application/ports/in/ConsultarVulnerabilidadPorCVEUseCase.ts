import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface ConsultarVulnerabilidadPorCVEUseCase {
  ejecutar(cve: string): Promise<Vulnerabilidad | null>;
}
