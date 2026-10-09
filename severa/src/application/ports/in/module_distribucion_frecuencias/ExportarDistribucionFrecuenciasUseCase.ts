import { VariableNumericaVulnerabilidad } from '../../../../domain/services/classification/VariablesVulnerabilidad';

// RF-38: la tabla de frecuencias que el analista está viendo, como .xlsx.
// Mismos parámetros que GenerarDistribucionFrecuenciasUseCase (tipo, número
// de intervalos, variable), para que lo exportado sea exactamente la tabla en
// pantalla y no una versión por defecto.
export interface ExportarDistribucionFrecuenciasUseCase {
  ejecutar(
    tipo: 'agrupada' | 'sinAgrupar',
    analistaId: string,
    numeroDeIntervalos?: number,
    variable?: VariableNumericaVulnerabilidad
  ): Promise<Buffer>;
}
