import { ExportarDistribucionFrecuenciasUseCase } from '../../ports/in/module_distribucion_frecuencias/ExportarDistribucionFrecuenciasUseCase';
import { GenerarDistribucionFrecuenciasUseCase } from '../../ports/in/module_distribucion_frecuencias/GenerarDistribucionFrecuenciasUseCase';
import { TablaFrecuencia } from '../../../domain/services/descriptive-statistics/DistribucionFrecuencias';
import { VariableNumericaVulnerabilidad } from '../../../domain/services/classification/VariablesVulnerabilidad';
import { BloqueDeInforme, titulo, encabezado, tabla } from '../../../infrastructure/adapters/out/reportes/BloquesDeInforme';
import { construirExcelDeTablasDeInforme } from '../../../infrastructure/adapters/out/reportes/ExportadorTablasDeInformeExcel';

const ETIQUETA_VARIABLE: Record<VariableNumericaVulnerabilidad, string> = {
  cvssScore: 'CVSS Score',
  diasParaParche: 'Días para parche'
};

// Número como texto sin ceros de relleno ni notación científica: el
// exportador de tablas convierte a celda numérica lo que tiene forma de
// número decimal simple (ver valorDeCelda en ExportadorTablasDeInformeExcel.ts).
function numero(valor: number, decimales: number): string {
  return String(Number(valor.toFixed(decimales)));
}

// RF-38. No recalcula nada: pide la tabla al mismo caso de uso que alimenta
// la pantalla (GenerarDistribucionFrecuencias, con sus validaciones y sus
// errores) y la entrega como libro de Excel. Reusa el exportador de tablas
// del informe (RF-79) con un "informe" de una sola tabla — mismo formato de
// hoja, mismo índice, sin un segundo generador de .xlsx que mantener.
// Importa el exportador desde infraestructura igual que ya lo hace
// ExportarDatasetValidado con ExportadorExcelAgrupado.
export class ExportarDistribucionFrecuencias implements ExportarDistribucionFrecuenciasUseCase {
  constructor(private readonly generarDistribucionFrecuencias: GenerarDistribucionFrecuenciasUseCase) {}

  async ejecutar(
    tipo: 'agrupada' | 'sinAgrupar',
    analistaId: string,
    numeroDeIntervalos?: number,
    variable: VariableNumericaVulnerabilidad = 'cvssScore'
  ): Promise<Buffer> {
    const resultado = await this.generarDistribucionFrecuencias.ejecutar(tipo, analistaId, undefined, numeroDeIntervalos, variable);
    const etiqueta = ETIQUETA_VARIABLE[variable];

    const bloques: BloqueDeInforme[] = [titulo(`Distribución de frecuencias — ${etiqueta}`)];

    if (tipo === 'agrupada') {
      const filas = resultado as TablaFrecuencia[];
      bloques.push(
        encabezado('Frecuencias agrupadas'),
        tabla(
          ['Intervalo', 'Límite inferior', 'Límite superior', 'Marca de clase', 'Frec. absoluta', 'Frec. relativa (%)', 'Frec. acumulada', 'Frec. rel. acumulada (%)'],
          filas.map((fila) => [
            fila.intervalo,
            numero(fila.limiteInferior, 6),
            numero(fila.limiteSuperior, 6),
            numero(fila.marcaDeClase, 6),
            String(fila.frecuenciaAbsoluta),
            numero(fila.frecuenciaRelativaPorcentaje, 2),
            String(fila.frecuenciaAcumulada),
            numero(fila.frecuenciaRelativaAcumulada * 100, 2)
          ])
        )
      );
    } else {
      const filas = resultado as Array<{ valor: number; frecuencia: number }>;
      bloques.push(encabezado('Frecuencias sin agrupar'), tabla([etiqueta, 'Frecuencia'], filas.map((fila) => [numero(fila.valor, 6), String(fila.frecuencia)])));
    }

    return construirExcelDeTablasDeInforme(bloques);
  }
}
