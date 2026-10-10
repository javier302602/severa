import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { CompararPorCategoriasCruzadasUseCase } from '../../ports/in/module_comparacion_categorias/CompararPorCategoriasCruzadasUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { escalaVigente } from '../module_priorizacion_clasificacion/EscalaDeClasificacion';
import { compararPorCategoriasCruzadas, resolverVariableAgrupacion } from '../../../domain/services/inferential-statistics/ComparacionPorCategoriasGenerico';
import { esVariableNumericaValida, VariableNumericaVulnerabilidad } from '../../../domain/services/classification/VariablesVulnerabilidad';
import { VariableDeConsultaInvalidaError } from '../../../domain/errors/VariableDeConsultaInvalidaError';

const VARIABLE_AGRUPACION_A_POR_DEFECTO = 'tipoAcceso';
const VARIABLE_AGRUPACION_B_POR_DEFECTO = 'estadoRemediacion';
const VARIABLE_VALOR_POR_DEFECTO: VariableNumericaVulnerabilidad = 'cvssScore';

function resolverVariableValor(valor: string | undefined): VariableNumericaVulnerabilidad {
  if (valor === undefined) return VARIABLE_VALOR_POR_DEFECTO;
  if (!esVariableNumericaValida(valor)) {
    throw new VariableDeConsultaInvalidaError(`"${valor}" no es una variable numérica válida (cvssScore, diasParaParche)`);
  }
  return valor;
}

export class CompararPorCategoriasCruzadas implements CompararPorCategoriasCruzadasUseCase {
  // RF-28 / RF-69: agrupar por nivel de riesgo ('severidad') usa la escala del
  // analista, con el vocabulario unificado.
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  async ejecutar(
    analistaId: string,
    variableAgrupacionA?: string,
    variableAgrupacionB?: string,
    variableValor?: string,
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown> {
    const lista = vulnerabilidades ?? (await this.vulnerabilidadRepository.listar(analistaId));
    const agrupacionA = resolverVariableAgrupacion(variableAgrupacionA ?? VARIABLE_AGRUPACION_A_POR_DEFECTO);
    const agrupacionB = resolverVariableAgrupacion(variableAgrupacionB ?? VARIABLE_AGRUPACION_B_POR_DEFECTO);
    const valor = resolverVariableValor(variableValor);

    const { escala } = await escalaVigente(this.escalaRepository, analistaId);
    return compararPorCategoriasCruzadas(lista, agrupacionA, agrupacionB, escala, valor);
  }
}
