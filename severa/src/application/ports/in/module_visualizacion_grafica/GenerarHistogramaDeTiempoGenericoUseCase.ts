// RF-58: histograma de una columna de tipo fecha/tiempo de un dataset
// genérico (M-03) — separado a propósito de GenerarGraficoUseCase.ts
// (CVSS/module_priorizacion_clasificacion), ver auditoría SDS M-07.
export interface GenerarHistogramaDeTiempoGenericoUseCase {
  // analistaId siempre del token, nunca del body/query/params — mismo
  // criterio IDOR que AnalizarColumnaUnivariadoGenericoUseCase.
  ejecutar(
    analistaId: string,
    sesionId: string,
    nombreColumna: string,
    formato?: 'svg' | 'json'
  ): Promise<unknown>;
}
