import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { FiltrarPorRangoCvssUseCase } from '../ports/in/FiltrarPorRangoCvssUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class FiltrarPorRangoCvss implements FiltrarPorRangoCvssUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorRangoCvss(cvssMin, cvssMax, analistaId);
  }
}
