import { httpClient } from './httpClient';

// Mejora 4 (Análisis de Datos General). Contrato verificado contra
// AnalisisDatasetController.ts real — módulo nuevo y separado del resto de
// SEVERA, rutas propias bajo /analisis-datos/..., nunca /dataset/... (ese
// prefijo es del módulo de vulnerabilidades).
export type TipoColumna = 'numerica' | 'categorica' | 'fecha' | 'texto';

export interface DiagnosticoColumna {
  nombre: string;
  tipo: TipoColumna;
  valoresFaltantes: number;
  porcentajeFaltante: number;
  valoresUnicos: number;
  valoresInconsistentes: number;
}

// POST /analisis-datos/analizar devuelve el diagnóstico (CalidadDeDatosGenerico)
// aplanado junto con sesionId — no un objeto anidado.
export interface DiagnosticoDataset {
  totalFilas: number;
  filasDuplicadas: number;
  columnas: DiagnosticoColumna[];
  sesionId: string;
}

export interface ResumenColumnaNumerica {
  tipo: 'numerica';
  nombre: string;
  valoresValidos: number;
  media: number;
  mediana: number;
  moda: number[];
  minimo: number;
  maximo: number;
  q1: number;
  q3: number;
  rango: number;
  varianza: number | null;
  desviacionEstandar: number | null;
}

export interface ResumenColumnaCategorica {
  tipo: 'categorica' | 'texto';
  nombre: string;
  valoresValidos: number;
  valoresUnicos: number;
  masFrecuente: Array<{ valor: string; frecuencia: number }>;
}

export interface ResumenColumnaFecha {
  tipo: 'fecha';
  nombre: string;
  valoresValidos: number;
  minimo: string | null;
  maximo: string | null;
}

export type ResumenColumna = ResumenColumnaNumerica | ResumenColumnaCategorica | ResumenColumnaFecha;

export interface TablaFrecuencia {
  intervalo: string;
  limiteInferior: number;
  limiteSuperior: number;
  marcaDeClase: number;
  frecuenciaAbsoluta: number;
  frecuenciaRelativa: number;
  frecuenciaRelativaPorcentaje: number;
  frecuenciaAcumulada: number;
  frecuenciaRelativaAcumulada: number;
}

export interface AnalisisUnivariadoNumerico {
  tipo: 'numerica';
  nombre: string;
  valoresValidos: number;
  valoresFaltantes: number;
  resumenCincoNumeros: { minimo: number; q1: number; mediana: number; q3: number; maximo: number; media: number };
  moda: number[];
  varianza: number | null;
  desviacionEstandar: number | null;
  coeficienteVariacion: number | null;
  distribucion: TablaFrecuencia[];
}

export interface AnalisisUnivariadoCategorico {
  tipo: 'categorica' | 'texto';
  nombre: string;
  valoresValidos: number;
  valoresFaltantes: number;
  valoresUnicos: number;
  moda: string[];
  distribucion: Array<{ valor: string; frecuenciaAbsoluta: number; frecuenciaRelativaPorcentaje: number }>;
}

export interface AnalisisUnivariadoFecha {
  tipo: 'fecha';
  nombre: string;
  valoresValidos: number;
  valoresFaltantes: number;
  minimo: string | null;
  maximo: string | null;
  distribucion: Array<{ valor: string; frecuenciaAbsoluta: number; frecuenciaRelativaPorcentaje: number }>;
}

export type AnalisisUnivariado = AnalisisUnivariadoNumerico | AnalisisUnivariadoCategorico | AnalisisUnivariadoFecha;

export interface ColumnaExcluida {
  nombre: string;
  motivo: string;
}

export interface CeldaCorrelacion {
  columna: string;
  valor: number | null;
  motivo?: string;
}

export interface FilaMatrizCorrelacion {
  columna: string;
  correlaciones: CeldaCorrelacion[];
}

export interface MatrizCorrelacion {
  columnas: string[];
  filas: FilaMatrizCorrelacion[];
  columnasExcluidas: ColumnaExcluida[];
}

export interface ValorAtipico {
  filaIndice: number;
  valor: number;
}

export interface OutliersColumna {
  columna: string;
  q1: number;
  q3: number;
  rangoIntercuartilico: number;
  limiteInferior: number;
  limiteSuperior: number;
  cantidadValoresAtipicos: number;
  valoresAtipicos: ValorAtipico[];
}

export interface ResultadoOutliers {
  columnas: OutliersColumna[];
  columnasExcluidas: ColumnaExcluida[];
}

export type FormatoInformeDataset = 'pdf' | 'docx';

export const analisisDatosService = {
  analizar: (archivo: File): Promise<DiagnosticoDataset> => {
    const formData = new FormData();
    formData.append('archivo', archivo);
    return httpClient.postForm('/analisis-datos/analizar', formData);
  },
  obtenerEstadisticasDescriptivas: (sesionId: string): Promise<{ columnas: ResumenColumna[] }> =>
    httpClient.get(`/analisis-datos/${sesionId}/estadisticas-descriptivas`),
  // nombreColumna va codificado: los nombres de columna de un dataset real
  // suelen tener espacios u otros caracteres no válidos en una URL (ver
  // comentario de esta ruta en AnalisisDatasetController.ts).
  obtenerAnalisisUnivariado: (sesionId: string, nombreColumna: string): Promise<AnalisisUnivariado> =>
    httpClient.get(`/analisis-datos/${sesionId}/univariado/${encodeURIComponent(nombreColumna)}`),
  obtenerMatrizCorrelacion: (sesionId: string): Promise<MatrizCorrelacion> =>
    httpClient.get(`/analisis-datos/${sesionId}/correlacion`),
  obtenerOutliers: (sesionId: string): Promise<ResultadoOutliers> => httpClient.get(`/analisis-datos/${sesionId}/outliers`),
  descargarInforme: (sesionId: string, formato: FormatoInformeDataset): Promise<Blob> =>
    httpClient.get(`/analisis-datos/${sesionId}/informe`, { formato })
};
