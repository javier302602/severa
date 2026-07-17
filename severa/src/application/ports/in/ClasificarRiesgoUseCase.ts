import { NivelDeRiesgo } from '../../../domain/value-objects/NivelDeRiesgo';

export interface ClasificarRiesgoUseCase {
  ejecutar(cve: string): Promise<NivelDeRiesgo | null>;
}
