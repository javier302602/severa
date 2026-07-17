import { ClasificarRiesgoUseCase } from '../ports/in/ClasificarRiesgoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { clasificar } from '../../domain/services/ClasificadorDeRiesgo';
import { NivelDeRiesgo } from '../../domain/value-objects/NivelDeRiesgo';

export class ClasificarRiesgo implements ClasificarRiesgoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string): Promise<NivelDeRiesgo | null> {
    const vulnerabilidad = await this.vulnerabilidadRepository.buscarPorCve(cve);
    if (!vulnerabilidad) {
      return null;
    }

    return clasificar(vulnerabilidad.cvssScore).valor;
  }
}
