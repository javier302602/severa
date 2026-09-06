import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorRangoCvssUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorRangoDeVariableUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

export class FiltrarPorRangoCvss implements FiltrarPorRangoCvssUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorRangoCvss(cvssMin, cvssMax, analistaId);
  }
}
