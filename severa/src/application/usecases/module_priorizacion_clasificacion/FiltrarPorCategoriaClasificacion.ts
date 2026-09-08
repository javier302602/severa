import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorCategoriaClasificacionUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacionUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

// RF-28 (M-04): el SDS lo marca "generalizado" (renombrado de "Filtro por
// Nivel de Severidad"), pero es solo el renombre de clase de
// FiltrarPorSeveridad — el parámetro (severidad) y el método del
// repositorio (filtrarPorSeveridad, columna severidad) siguen siendo
// específicos de CVSS. Pendiente real hasta auditar M-09.

export class FiltrarPorCategoriaClasificacion implements FiltrarPorCategoriaClasificacionUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(severidad: string, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorSeveridad(severidad, analistaId);
  }
}
