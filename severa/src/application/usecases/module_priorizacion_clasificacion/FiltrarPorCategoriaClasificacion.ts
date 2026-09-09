import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorCategoriaClasificacionUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacionUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { VariableCategoricaVulnerabilidad } from '../../../domain/services/classification/VariablesVulnerabilidad';

// M-04 (retoma, RF-28): generalizado de verdad — `variable` decide qué
// columna categórica compara el repositorio (ver PostgresVulnerabilidadRepository.
// filtrarPorCategoria), en vez de asumir siempre severidad. Default
// 'severidad' para retrocompatibilidad total con quien llame sin este
// parámetro (URLs y filtros favoritos de M-11 ya existentes).
const VARIABLE_POR_DEFECTO: VariableCategoricaVulnerabilidad = 'severidad';

export class FiltrarPorCategoriaClasificacion implements FiltrarPorCategoriaClasificacionUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(
    valor: string,
    analistaId: string,
    variable: VariableCategoricaVulnerabilidad = VARIABLE_POR_DEFECTO
  ): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorCategoria(variable, valor, analistaId);
  }
}
