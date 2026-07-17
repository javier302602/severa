import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { MarcarComoRemediadaUseCase } from '../ports/in/MarcarComoRemediadaUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class MarcarComoRemediada implements MarcarComoRemediadaUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string): Promise<Vulnerabilidad | null> {
    const vulnerabilidad = await this.vulnerabilidadRepository.buscarPorCve(cve);
    if (!vulnerabilidad) {
      return null;
    }

    // Lanza TransicionDeEstadoInvalidaError si el estado actual no permite pasar a Remediada
    // (por ejemplo, Pendiente -> Remediada directo, sin pasar por EnProceso).
    const actualizada = vulnerabilidad.transicionarEstado('Remediada');
    await this.vulnerabilidadRepository.actualizarEstado(actualizada.cve.valor, actualizada.estadoRemediacion.valor, actualizada.fechaRemediacion);

    return actualizada;
  }
}
