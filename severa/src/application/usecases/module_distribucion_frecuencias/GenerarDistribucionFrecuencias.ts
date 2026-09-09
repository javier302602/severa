import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { GenerarDistribucionFrecuenciasUseCase } from '../../ports/in/module_distribucion_frecuencias/GenerarDistribucionFrecuenciasUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import {
  generarTablaAgrupada,
  generarTablaSinAgrupar,
  generarIntervalosEquiespaciados,
  validarNumeroDeIntervalos,
  calcularCantidadIntervalosAutomatica
} from '../../../domain/services/descriptive-statistics/DistribucionFrecuencias';
import { VariableNumericaVulnerabilidad, obtenerValorNumerico } from '../../../domain/services/classification/VariablesVulnerabilidad';
import { minimoDe, maximoDe } from '../../../domain/services/MinMax';

// RANGO_CVSS: 0-10 fijo por decisión de negocio (RF-39) — a diferencia del
// pipeline genérico (que calcula min/max de la columna real), CVSS tiene una
// escala universal definida por el estándar. Un override manual de
// numeroDeIntervalos sigue repartiendo ese mismo rango 0-10, nunca el rango
// real de los scores importados: las bandas deben significar lo mismo sin
// importar qué haya cargado cada analista.
//
// M-05 (retoma, RF-33): decisión de arquitectura confirmada — SOLO
// cvssScore mantiene este rango fijo (es la única variable con una escala
// estándar universal). Cualquier otra variable (diasParaParche) usa el
// rango REAL de los datos, mismo criterio que generarIntervalosAutomaticos()
// de AnalisisUnivariadoGenerico.ts — ver la rama `variable !== 'cvssScore'`
// más abajo.
const RANGO_CVSS = { minimo: 0, maximo: 10 };

const VARIABLE_POR_DEFECTO: VariableNumericaVulnerabilidad = 'cvssScore';

// Etiquetas para los mensajes de ValorEstadisticoError (generarTablaAgrupada/
// generarTablaSinAgrupar las aceptan como parámetro) — sin esto, un catálogo
// vacío filtrando por diasParaParche diría "La lista de CVSS Score no puede
// estar vacía", que sería directamente incorrecto.
const ETIQUETAS_VARIABLE: Record<VariableNumericaVulnerabilidad, string> = {
  cvssScore: 'CVSS Score',
  diasParaParche: 'Días para Parche'
};

export class GenerarDistribucionFrecuencias implements GenerarDistribucionFrecuenciasUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(
    tipo: 'agrupada' | 'sinAgrupar',
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    numeroDeIntervalos?: number,
    variable: VariableNumericaVulnerabilidad = VARIABLE_POR_DEFECTO
  ): Promise<unknown> {
    const lista = vulnerabilidades ?? (await this.vulnerabilidadRepository.listar(analistaId));
    // diasParaParche es opcional en Vulnerabilidad — se excluye acá (no como
    // 0 ni como NaN) para que generarTablaAgrupada/generarTablaSinAgrupar
    // (que exigen números finitos) nunca lo vean.
    const scores = lista
      .map((item) => obtenerValorNumerico(item, variable))
      .filter((valor): valor is number => valor !== undefined);
    const etiqueta = ETIQUETAS_VARIABLE[variable];

    if (tipo === 'sinAgrupar') {
      // numeroDeIntervalos no aplica a esta rama — se ignora sin validar,
      // mismo comportamiento de siempre (nunca se validó acá).
      return generarTablaSinAgrupar(scores, etiqueta);
    }

    // Validación de forma antes de tocar el reparto — mismo orden que ya
    // tenía el código para CVSS, ahora aplicado sin importar la variable.
    if (numeroDeIntervalos !== undefined) {
      validarNumeroDeIntervalos(numeroDeIntervalos);
    }

    if (variable === 'cvssScore') {
      // Comportamiento EXACTO de siempre — RF-33 no cambia nada acá.
      if (numeroDeIntervalos === undefined) {
        return generarTablaAgrupada(scores, undefined, etiqueta);
      }
      return generarTablaAgrupada(
        scores,
        generarIntervalosEquiespaciados(RANGO_CVSS.minimo, RANGO_CVSS.maximo, numeroDeIntervalos),
        etiqueta
      );
    }

    // Otra variable numérica: sin un rango fijo de negocio, se usa el rango
    // real de los datos — si no queda ningún valor tras filtrar (catálogo
    // vacío, o ninguna vulnerabilidad con diasParaParche cargado),
    // generarTablaAgrupada([], ...) dispara el mismo ValorEstadisticoError
    // de siempre, ahora con la etiqueta correcta, en vez de un caso especial
    // nuevo (mismo criterio ya probado por ErrorHandler.test.ts para CVSS).
    if (scores.length === 0) {
      return generarTablaAgrupada(scores, undefined, etiqueta);
    }

    const cantidadIntervalos = numeroDeIntervalos ?? calcularCantidadIntervalosAutomatica(scores.length);
    return generarTablaAgrupada(
      scores,
      generarIntervalosEquiespaciados(minimoDe(scores), maximoDe(scores), cantidadIntervalos),
      etiqueta
    );
  }
}
