import { AnalisisUnivariado } from '../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';

export interface AnalizarColumnaUnivariadoGenericoUseCase {
  // Mismo criterio que CalcularEstadisticasDescriptivasGenericoUseCase:
  // analistaId siempre del token, nunca del body/query/params.
  ejecutar(analistaId: string, sesionId: string, nombreColumna: string): Promise<AnalisisUnivariado>;
}
