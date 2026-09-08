import { AnalisisUnivariado } from '../../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';

export interface AnalizarColumnaUnivariadoGenericoUseCase {
  // Mismo criterio que CalcularEstadisticasDescriptivasGenericoUseCase:
  // analistaId siempre del token, nunca del body/query/params.
  // numeroDeIntervalos (RF-39): opcional, override manual sobre el cálculo
  // automático por Sturges (ver AnalisisUnivariadoGenerico.ts).
  ejecutar(analistaId: string, sesionId: string, nombreColumna: string, numeroDeIntervalos?: number): Promise<AnalisisUnivariado>;
}
