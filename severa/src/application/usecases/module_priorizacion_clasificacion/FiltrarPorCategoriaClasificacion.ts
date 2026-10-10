import { FiltrarPorCategoriaClasificacionUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacionUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { CatalogoClasificado } from '../../ports/in/module_priorizacion_clasificacion/EscalaDeClasificacionUseCases';
import { VariableCategoricaVulnerabilidad } from '../../../domain/services/classification/VariablesVulnerabilidad';
import { nivelDeRiesgoDesdeTexto } from '../../../domain/shared/value-objects/EscalaDeClasificacion';
import { VariableDeConsultaInvalidaError } from '../../../domain/errors/VariableDeConsultaInvalidaError';
import { clasificarConEscala, escalaVigente } from './EscalaDeClasificacion';

// M-04 (retoma, RF-28): por defecto se filtra por nivel de riesgo
// ('severidad'), para no romper URLs ni filtros favoritos que nunca mandan
// la variable.
const VARIABLE_POR_DEFECTO: VariableCategoricaVulnerabilidad = 'severidad';

// RF-28: "el filtro por categoría refleja los umbrales configurados". El
// nivel pedido se traduce al rango de CVSS que le da la escala del analista y
// se filtra por ese rango en SQL; nunca contra la columna `severidad`.
export class FiltrarPorCategoriaClasificacion implements FiltrarPorCategoriaClasificacionUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  async ejecutar(
    valor: string,
    analistaId: string,
    variable: VariableCategoricaVulnerabilidad = VARIABLE_POR_DEFECTO
  ): Promise<CatalogoClasificado> {
    const escala = await escalaVigente(this.escalaRepository, analistaId);
    let vulnerabilidades;
    if (variable === 'severidad') {
      const nivel = nivelDeRiesgoDesdeTexto(valor);
      if (!nivel) {
        throw new VariableDeConsultaInvalidaError('"' + valor + '" no es un nivel de riesgo: usá Bajo, Moderado, Alto o Crítico');
      }
      vulnerabilidades = await this.vulnerabilidadRepository.filtrarPorNivelDeRiesgo(escala.escala.rango(nivel), analistaId);
    } else {
      vulnerabilidades = await this.vulnerabilidadRepository.filtrarPorCategoria(variable, valor, analistaId);
    }
    return { escala, vulnerabilidades: clasificarConEscala(vulnerabilidades, escala.escala) };
  }
}
