import { NivelDeRiesgo } from '../../../domain/value-objects/NivelDeRiesgo';

export interface ClasificarRiesgoUseCase {
  ejecutar(cve: string, analistaId: string): Promise<NivelDeRiesgo | null>;
}
