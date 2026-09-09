import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { CompararPorCategoriaUseCase } from '../../ports/in/module_comparacion_categorias/CompararPorCategoriaUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { compararPorCategorias, resolverVariableAgrupacion } from '../../../domain/services/inferential-statistics/ComparacionPorCategoriasGenerico';
import { esVariableNumericaValida, VariableNumericaVulnerabilidad } from '../../../domain/services/classification/VariablesVulnerabilidad';
import { VariableDeConsultaInvalidaError } from '../../../domain/errors/VariableDeConsultaInvalidaError';

const VARIABLE_AGRUPACION_POR_DEFECTO = 'tipoAcceso';
const VARIABLE_VALOR_POR_DEFECTO: VariableNumericaVulnerabilidad = 'cvssScore';

function resolverVariableValor(valor: string | undefined): VariableNumericaVulnerabilidad {
  if (valor === undefined) return VARIABLE_VALOR_POR_DEFECTO;
  if (!esVariableNumericaValida(valor)) {
    throw new VariableDeConsultaInvalidaError(`"${valor}" no es una variable numérica válida (cvssScore, diasParaParche)`);
  }
  return valor;
}

export class CompararPorCategoria implements CompararPorCategoriaUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(
    analistaId: string,
    variableAgrupacion?: string,
    variableValor?: string,
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown> {
    const lista = vulnerabilidades ?? (await this.vulnerabilidadRepository.listar(analistaId));
    const agrupacion = resolverVariableAgrupacion(variableAgrupacion ?? VARIABLE_AGRUPACION_POR_DEFECTO);
    const valor = resolverVariableValor(variableValor);

    return compararPorCategorias(lista, agrupacion, valor);
  }
}
