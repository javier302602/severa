import { AnalisisRealizado } from '../../../../domain/entities/AnalisisRealizado';

// Puerto de escritura para RF-11: existe para que los módulos que generan
// análisis reales (M-05 a M-09, cuando se auditen) lo invoquen. Deliberadamente
// no tiene ningún productor conectado todavía — ver container.ts.
export interface RegistrarAnalisisRealizadoUseCase {
  ejecutar(input: { analistaId: string; tipoEvento: string; payload: Record<string, unknown> }): Promise<AnalisisRealizado>;
}
