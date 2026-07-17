import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { MarcarEnProcesoDeRemediacionUseCase } from '../ports/in/MarcarEnProcesoDeRemediacionUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class MarcarEnProcesoDeRemediacion implements MarcarEnProcesoDeRemediacionUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string): Promise<Vulnerabilidad | null> {
    const vulnerabilidad = await this.vulnerabilidadRepository.buscarPorCve(cve);
    if (!vulnerabilidad) {
      return null;
    }

    // Lanza TransicionDeEstadoInvalidaError si el estado actual no permite pasar a EnProceso.
    const actualizada = vulnerabilidad.transicionarEstado('EnProceso');
    await this.vulnerabilidadRepository.actualizarEstado(actualizada.cve.valor, actualizada.estadoRemediacion.valor, actualizada.fechaRemediacion);

    return actualizada;
  }
}
