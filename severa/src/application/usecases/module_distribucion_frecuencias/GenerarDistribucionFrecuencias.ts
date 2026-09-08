import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { GenerarDistribucionFrecuenciasUseCase } from '../../ports/in/module_distribucion_frecuencias/GenerarDistribucionFrecuenciasUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import {
  generarTablaAgrupada,
  generarTablaSinAgrupar,
  generarIntervalosEquiespaciados,
  validarNumeroDeIntervalos
} from '../../../domain/services/descriptive-statistics/DistribucionFrecuencias';

// RANGO_CVSS: 0-10 fijo por decisión de negocio (RF-39) — a diferencia del
// pipeline genérico (que calcula min/max de la columna real), CVSS tiene una
// escala universal definida por el estándar. Un override manual de
// numeroDeIntervalos sigue repartiendo ese mismo rango 0-10, nunca el rango
// real de los scores importados: las bandas deben significar lo mismo sin
// importar qué haya cargado cada analista.
const RANGO_CVSS = { minimo: 0, maximo: 10 };

export class GenerarDistribucionFrecuencias implements GenerarDistribucionFrecuenciasUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(
    tipo: 'agrupada' | 'sinAgrupar',
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    numeroDeIntervalos?: number
  ): Promise<unknown> {
    const lista = vulnerabilidades ?? (await this.vulnerabilidadRepository.listar(analistaId));
    const scores = lista.map((item) => item.cvssScore.valor);

    if (tipo === 'agrupada') {
      if (numeroDeIntervalos === undefined) {
        return generarTablaAgrupada(scores);
      }

      validarNumeroDeIntervalos(numeroDeIntervalos);
      const intervalos = generarIntervalosEquiespaciados(RANGO_CVSS.minimo, RANGO_CVSS.maximo, numeroDeIntervalos);
      return generarTablaAgrupada(scores, intervalos);
    }

    return generarTablaSinAgrupar(scores);
  }
}
