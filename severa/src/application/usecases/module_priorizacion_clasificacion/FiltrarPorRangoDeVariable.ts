import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorRangoDeVariableUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorRangoDeVariableUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { VariableNumericaVulnerabilidad } from '../../../domain/services/classification/VariablesVulnerabilidad';

// M-04 (retoma, RF-27): generalizado de verdad — `variable` decide qué
// columna numérica compara el repositorio (ver PostgresVulnerabilidadRepository.
// filtrarPorRango), en vez de asumir siempre cvss_score. Default 'cvssScore'
// para retrocompatibilidad total con quien llame sin este parámetro (URLs y
// filtros favoritos de M-11 ya existentes).
const VARIABLE_POR_DEFECTO: VariableNumericaVulnerabilidad = 'cvssScore';

export class FiltrarPorRangoDeVariable implements FiltrarPorRangoDeVariableUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(
    minimo: number,
    maximo: number,
    analistaId: string,
    variable: VariableNumericaVulnerabilidad = VARIABLE_POR_DEFECTO
  ): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorRango(variable, minimo, maximo, analistaId);
  }
}
