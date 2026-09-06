import { NivelDeRiesgo } from '../../../../domain/shared/value-objects/NivelDeRiesgo';

export interface ClasificarRiesgoUseCase {
  ejecutar(cve: string, analistaId: string): Promise<NivelDeRiesgo | null>;
}
