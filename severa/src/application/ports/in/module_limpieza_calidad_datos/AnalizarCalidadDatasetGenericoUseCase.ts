import { DiagnosticoDataset, ResultadoFilasDuplicadas, ResultadoFilasIncompletas, ResultadoValidacionRango } from '../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';

// M-15 (RF-114/RF-116/RF-117): a diferencia del diagnóstico embebido en
// POST /analisis-datos/analizar (RF-112, siempre con los valores por
// defecto), este endpoint es re-invocable por sesión con parámetros que el
// analista decide DESPUÉS de ver el diagnóstico inicial — mismo criterio que
// incluirIdentificadores en CalcularEstadisticasDescriptivasGenericoUseCase.
// Todos los campos son opcionales: sin ninguno, el comportamiento reproduce
// el diagnóstico por defecto (columnasClave = todas las columnas, mismo
// total que DiagnosticoDataset.filasDuplicadas; umbralFilaIncompleta = 50;
// sin validación de rango).
export interface OpcionesAnalisisCalidad {
  umbralFilaIncompleta?: number;
  columnasClave?: string[];
  rangoColumna?: string;
  rangoMinimo?: number;
  rangoMaximo?: number;
}

export interface ResultadoAnalisisCalidad {
  diagnostico: DiagnosticoDataset;
  filasIncompletas: ResultadoFilasIncompletas;
  duplicados: ResultadoFilasDuplicadas;
  // Solo presente si el analista pidió rangoColumna en esta llamada.
  validacionRango?: ResultadoValidacionRango;
}

export interface AnalizarCalidadDatasetGenericoUseCase {
  // Mismo criterio de siempre: analistaId sale del token, nunca del query.
  ejecutar(analistaId: string, sesionId: string, opciones: OpcionesAnalisisCalidad): Promise<ResultadoAnalisisCalidad>;
}
