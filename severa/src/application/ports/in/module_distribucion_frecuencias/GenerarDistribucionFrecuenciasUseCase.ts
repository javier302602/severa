import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { VariableNumericaVulnerabilidad } from '../../../../domain/services/classification/VariablesVulnerabilidad';

export interface GenerarDistribucionFrecuenciasUseCase {
  // numeroDeIntervalos (RF-39): override manual y opcional, solo aplica a
  // tipo='agrupada'. Sin él, se mantienen las 5 bandas oficiales de CVSS de
  // siempre (0-2, 2-4, 4-6, 6-8, 8-10) — ver GenerarDistribucionFrecuencias.ts.
  // variable (M-05, retoma): generaliza sobre qué variable numérica de
  // Vulnerabilidad se arma la distribución (cvssScore | diasParaParche) —
  // agregado AL FINAL de la firma, para no romper ninguna llamada existente
  // que no lo mande. Default 'cvssScore' (ver el caso de uso).
  ejecutar(
    tipo: 'agrupada' | 'sinAgrupar',
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    numeroDeIntervalos?: number,
    variable?: VariableNumericaVulnerabilidad
  ): Promise<unknown>;
}
