import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorRangoDeVariableUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorRangoDeVariableUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

export class FiltrarPorRangoDeVariable implements FiltrarPorRangoDeVariableUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorRangoCvss(cvssMin, cvssMax, analistaId);
  }
}
