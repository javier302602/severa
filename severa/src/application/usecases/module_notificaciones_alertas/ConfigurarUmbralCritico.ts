import { ConfigurarUmbralCriticoUseCase } from '../../ports/in/module_notificaciones_alertas/ConfigurarUmbralCriticoUseCase';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { VariableNumericaVulnerabilidad, esVariableNumericaValida } from '../../../domain/services/classification/VariablesVulnerabilidad';
import { VariableDeConsultaInvalidaError } from '../../../domain/errors/VariableDeConsultaInvalidaError';

// RF-99 (M-13, retoma): valida contra VariableNumericaVulnerabilidad (M-04)
// tal cual — mismo conjunto que ya usa FiltrarPorRangoDeVariable, sin
// inventar una tercera unión de variables válidas.
export class ConfigurarUmbralCritico implements ConfigurarUmbralCriticoUseCase {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(analistaId: string, variable: string, valor: number): Promise<void> {
    if (!esVariableNumericaValida(variable)) {
      throw new VariableDeConsultaInvalidaError(`"${variable}" no es una variable numérica válida (cvssScore, diasParaParche)`);
    }
    if (!Number.isFinite(valor)) {
      throw new VariableDeConsultaInvalidaError(`"${valor}" no es un umbral numérico válido`);
    }

    await this.analistaRepository.actualizarUmbralCritico(analistaId, variable as VariableNumericaVulnerabilidad, valor);
  }
}
