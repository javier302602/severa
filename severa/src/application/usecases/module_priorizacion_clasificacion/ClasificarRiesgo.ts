import { ClasificarRiesgoUseCase } from '../../ports/in/module_priorizacion_clasificacion/ClasificarRiesgoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { escalaVigente } from './EscalaDeClasificacion';
import { NivelDeRiesgo } from '../../../domain/shared/value-objects/NivelDeRiesgo';

export class ClasificarRiesgo implements ClasificarRiesgoUseCase {
  // RF-69 + RF-28 (Modo B): el nivel con la escala del analista.
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  async ejecutar(cve: string, analistaId: string): Promise<NivelDeRiesgo | null> {
    const vulnerabilidad = await this.vulnerabilidadRepository.buscarPorCve(cve, analistaId);
    if (!vulnerabilidad) {
      return null;
    }

    const { escala } = await escalaVigente(this.escalaRepository, analistaId);
    return escala.clasificar(vulnerabilidad.cvssScore.valor);
  }
}
