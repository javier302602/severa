import { ClasificarRiesgoUseCase } from '../../ports/in/module_priorizacion_clasificacion/ClasificarRiesgoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { clasificar } from '../../../domain/services/classification/ClasificadorDeRiesgo';
import { NivelDeRiesgo } from '../../../domain/shared/value-objects/NivelDeRiesgo';

export class ClasificarRiesgo implements ClasificarRiesgoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string, analistaId: string): Promise<NivelDeRiesgo | null> {
    const vulnerabilidad = await this.vulnerabilidadRepository.buscarPorCve(cve, analistaId);
    if (!vulnerabilidad) {
      return null;
    }

    return clasificar(vulnerabilidad.cvssScore).valor;
  }
}
