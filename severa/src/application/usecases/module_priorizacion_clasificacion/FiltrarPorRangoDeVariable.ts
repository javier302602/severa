import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorRangoDeVariableUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorRangoDeVariableUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

// RF-27 (M-04): el SDS lo marca "generalizado" (rango sobre cualquier
// variable numérica), pero es solo el renombre de clase de
// FiltrarPorRangoCvss — los parámetros (cvssMin/cvssMax) y el método del
// repositorio (filtrarPorRangoCvss, columna cvss_score) siguen siendo
// específicos de CVSS. Pendiente real hasta auditar M-09.

export class FiltrarPorRangoDeVariable implements FiltrarPorRangoDeVariableUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorRangoCvss(cvssMin, cvssMax, analistaId);
  }
}
