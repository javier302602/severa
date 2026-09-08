import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';

export interface GenerarDistribucionFrecuenciasUseCase {
  // numeroDeIntervalos (RF-39): override manual y opcional, solo aplica a
  // tipo='agrupada'. Sin él, se mantienen las 5 bandas oficiales de CVSS de
  // siempre (0-2, 2-4, 4-6, 6-8, 8-10) — ver GenerarDistribucionFrecuencias.ts.
  ejecutar(
    tipo: 'agrupada' | 'sinAgrupar',
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    numeroDeIntervalos?: number
  ): Promise<unknown>;
}
