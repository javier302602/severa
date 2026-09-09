import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { CompararPorCategoriasCruzadasUseCase } from '../../ports/in/module_comparacion_categorias/CompararPorCategoriasCruzadasUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
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
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

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

    return compararPorCategoriasCruzadas(lista, agrupacionA, agrupacionB, valor);
  }
}
