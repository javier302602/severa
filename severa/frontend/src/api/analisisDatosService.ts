import { httpClient } from './httpClient';
import { parametrosDeInforme, type OpcionesDescargaDeInforme } from './formatosDeInforme';

// Mejora 4 (Análisis de Datos General). Contrato verificado contra
// AnalisisDatasetController.ts real — módulo nuevo y separado del resto de
// SEVERA, rutas propias bajo /analisis-datos/..., nunca /dataset/... (ese
// prefijo es del módulo de vulnerabilidades).
export type TipoColumna = 'numerica' | 'categorica' | 'fecha' | 'texto';

// Los 9 tipos de RF-107. `TipoColumna` (arriba) es el resumen de 4 valores
// con el que se calculan los análisis; este es el que ve y corrige el analista.
export type TipoColumnaDetallado =
  | 'numerica_continua'
  | 'numerica_discreta'
  | 'categorica_nominal'
  | 'categorica_ordinal'
  | 'binaria'
  | 'fecha'
  | 'fecha_hora'
  | 'texto_libre'
  | 'identificador';

export type CorreccionesDeTipo = Record<string, TipoColumnaDetallado>;

export interface DiagnosticoColumna {
  nombre: string;
  tipo: TipoColumna;
  valoresFaltantes: number;
  porcentajeFaltante: number;
  valoresUnicos: number;
  valoresInconsistentes: number;
  // RF-107/RF-111. Opcionales: el backend los manda siempre, pero hay pruebas
  // y pantallas que arman un diagnóstico mínimo.
  tipoDetallado?: TipoColumnaDetallado;
  // Lo que dijo la detección automática, aunque el analista lo haya corregido.
  tipoDetectado?: TipoColumnaDetallado;
  tipoCorregidoManualmente?: boolean;
}

// El diagnóstico de calidad de un dataset (CalidadDeDatosGenerico).
export interface DiagnosticoDeCalidad {
  totalFilas: number;
  filasDuplicadas: number;
  columnas: DiagnosticoColumna[];
}

// POST /analisis-datos/analizar devuelve el diagnóstico aplanado junto con
// sesionId y datasetId — no un objeto anidado.
export interface DiagnosticoDataset extends DiagnosticoDeCalidad {
  sesionId: string;
  // El dataset guardado al que pertenece la sesión (el original recién
  // cargado). Con él se corrigen tipos, se limpia y se versiona.
  datasetId?: string;
}

// RF-110: lo que el analista decidió sobre la variable objetivo. El sistema
// solo sugiere; nunca pasa a "confirmada" por su cuenta.
export type DecisionVariableObjetivo =
  | { estado: 'pendiente'; columna: null }
  | { estado: 'rechazada'; columna: null }
  | { estado: 'confirmada'; columna: string };

// Un dataset guardado, abierto en una sesión de análisis. Es lo que devuelven
// POST /analisis-datos/:datasetId/abrir y POST /analisis-datos/:sesionId/limpieza.
export interface DatasetAbierto {
  sesionId: string;
  datasetId: string;
  // El dataset original de la familia (igual a datasetId si este es el original).
  datasetOriginalId: string;
  nombreArchivo: string;
  // 0 = el original, tal como se cargó; 1, 2, 3… = versiones procesadas.
  version: number;
  versionBase: number | null;
  diagnostico: DiagnosticoDeCalidad;
  tiposCorregidos: CorreccionesDeTipo;
  variableObjetivo: DecisionVariableObjetivo;
}

// --- RF-108: serie de tiempo -------------------------------------------------
export type ViabilidadDeSerie = 'directa' | 'requiere_agregacion' | 'no_viable';

export interface EvaluacionDeColumnaTemporal {
  columna: string;
  tipo: 'fecha' | 'fecha_hora';
  valoresValidos: number;
  instantesDistintos: number;
  desde: string | null;
  hasta: string | null;
  viabilidad: ViabilidadDeSerie;
  frecuencia: string | null;
  periodosConDatos: number;
  periodosFaltantes: number;
  cobertura: number;
  motivo: string;
}

export interface EvaluacionDeSerieDeTiempo {
  columnasTemporales: EvaluacionDeColumnaTemporal[];
  esViableComoSerieDeTiempo: boolean;
  columnaSugerida: string | null;
  variablesNumericas: string[];
  resumen: string;
}

// --- RF-110: variable objetivo -----------------------------------------------
export interface CandidataAVariableObjetivo {
  columna: string;
  tipo: TipoColumnaDetallado;
  puntaje: number;
  motivos: string[];
}

export interface EstadoDeVariableObjetivo {
  candidatas: CandidataAVariableObjetivo[];
  nota: string;
  decision: DecisionVariableObjetivo;
  columnasElegibles: string[];
}

export interface ResultadoDefinicionDeVariableObjetivo {
  decision: DecisionVariableObjetivo;
  anterior: DecisionVariableObjetivo;
  huboCambio: boolean;
}

// --- RF-111: corrección de tipo ----------------------------------------------
export interface ResultadoCorreccionDeTipo {
  huboCambio: boolean;
  columna: string;
  tipoAnterior: TipoColumnaDetallado;
  tipoVigente: TipoColumnaDetallado;
  tipoDetectado: TipoColumnaDetallado;
  tiposCorregidos: CorreccionesDeTipo;
  diagnostico: DiagnosticoDeCalidad;
}

// --- RF-120/121: tratamiento de valores faltantes ----------------------------
export type EstrategiaDeFaltantes = 'eliminar_registros' | 'eliminar_columna' | 'imputar';
export type MetodoDeImputacion = 'media' | 'mediana' | 'moda';

export interface OpcionDeTratamiento {
  estrategia: EstrategiaDeFaltantes;
  disponible: boolean;
  metodos: MetodoDeImputacion[];
  motivoNoDisponible?: string;
}

export interface PropuestaDeTratamiento {
  columna: string;
  tipo: TipoColumnaDetallado;
  valoresFaltantes: number;
  porcentajeFaltante: number;
  opciones: OpcionDeTratamiento[];
  recomendacion: { estrategia: EstrategiaDeFaltantes | 'no_tratar'; metodo?: MetodoDeImputacion; motivo: string };
}

export interface PropuestaDeLimpieza {
  totalFilas: number;
  totalColumnas: number;
  propuestas: PropuestaDeTratamiento[];
}

export interface DecisionDeTratamiento {
  columna: string;
  estrategia: EstrategiaDeFaltantes;
  metodo?: MetodoDeImputacion;
}

export interface OperacionDeLimpiezaAplicada {
  operacion: EstrategiaDeFaltantes;
  variable: string;
  registrosAfectados: number;
  metodo: string;
  valorImputado?: number | string | boolean;
  nota?: string;
}

export interface ResumenDeLimpieza {
  filasAntes: number;
  filasDespues: number;
  filasEliminadas: number;
  columnasEliminadas: string[];
  celdasImputadas: number;
  operaciones: OperacionDeLimpiezaAplicada[];
}

export interface ResultadoDeLimpiezaAplicada extends DatasetAbierto {
  versionBase: number;
  resumen: ResumenDeLimpieza;
}

// --- RF-123/136: bitácora y versiones ----------------------------------------
export type OperacionDeBitacora = EstrategiaDeFaltantes | 'corregir_tipo' | 'definir_variable_objetivo';

export interface EntradaDeBitacora {
  id: string;
  fecha: string;
  secuencia: number;
  operacion: OperacionDeBitacora;
  variable: string | null;
  registrosAfectados: number;
  metodo: string;
  versionOrigen: number;
  versionResultado: number | null;
  detalle: Record<string, unknown>;
  nombreAnalista: string | null;
}

export interface ResumenDeVersion {
  datasetId: string;
  version: number;
  versionBase: number | null;
  esOriginal: boolean;
  fecha: string;
  totalFilas: number | null;
  totalColumnas: number;
  operaciones: Array<{ operacion: OperacionDeBitacora; variable: string | null; metodo: string; registrosAfectados: number }>;
}

export interface ResumenDeDataset {
  datasetOriginalId: string;
  nombreArchivo: string;
  fechaCarga: string;
  totalFilas: number | null;
  totalColumnas: number;
  versionesProcesadas: number;
  ultimaVersion: { datasetId: string; version: number; fecha: string };
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
  descargarInforme: (sesionId: string, opciones: OpcionesDescargaDeInforme): Promise<Blob> =>
    httpClient.get(`/analisis-datos/${sesionId}/informe`, parametrosDeInforme(opciones)),

  // M-14, Ronda 2.
  evaluarSerieDeTiempo: (sesionId: string): Promise<EvaluacionDeSerieDeTiempo> =>
    httpClient.get(`/analisis-datos/${sesionId}/serie-de-tiempo`),
  obtenerVariableObjetivo: (sesionId: string): Promise<EstadoDeVariableObjetivo> =>
    httpClient.get(`/analisis-datos/${sesionId}/variable-objetivo`),
  // columna = null descarta las sugerencias (el dataset no tiene variable objetivo).
  definirVariableObjetivo: (sesionId: string, columna: string | null): Promise<ResultadoDefinicionDeVariableObjetivo> =>
    httpClient.put(`/analisis-datos/${sesionId}/variable-objetivo`, { columna }),
  // tipo = null vuelve a la detección automática.
  corregirTipoDeVariable: (sesionId: string, columna: string, tipo: TipoColumnaDetallado | null): Promise<ResultadoCorreccionDeTipo> =>
    httpClient.put(`/analisis-datos/${sesionId}/tipo-de-variable`, { columna, tipo }),

  // M-15, Ronda 2. Tres pasos; solo el último guarda algo.
  obtenerPropuestaDeLimpieza: (sesionId: string): Promise<PropuestaDeLimpieza> =>
    httpClient.get(`/analisis-datos/${sesionId}/limpieza/propuesta`),
  previsualizarLimpieza: (sesionId: string, decisiones: DecisionDeTratamiento[]): Promise<ResumenDeLimpieza> =>
    httpClient.post(`/analisis-datos/${sesionId}/limpieza/vista-previa`, { decisiones }),
  // RF-120: el backend no aplica nada si `confirmado` no es exactamente true.
  // Este método lo manda siempre; quien lo llama es responsable de haberle
  // pedido la confirmación al analista (ver LimpiezaSeccion).
  aplicarLimpieza: (sesionId: string, decisiones: DecisionDeTratamiento[]): Promise<ResultadoDeLimpiezaAplicada> =>
    httpClient.post(`/analisis-datos/${sesionId}/limpieza`, { decisiones, confirmado: true }),

  // M-12 (RF-123, RF-136).
  listarDatasets: (): Promise<ResumenDeDataset[]> => httpClient.get('/analisis-datos/datasets'),
  listarVersiones: (datasetId: string): Promise<ResumenDeVersion[]> => httpClient.get(`/analisis-datos/${datasetId}/versiones`),
  abrirDataset: (datasetId: string): Promise<DatasetAbierto> => httpClient.post(`/analisis-datos/${datasetId}/abrir`),
  obtenerBitacora: (datasetId: string): Promise<EntradaDeBitacora[]> => httpClient.get(`/analisis-datos/${datasetId}/bitacora`),
  exportarDataset: (datasetId: string): Promise<Blob> => httpClient.get(`/analisis-datos/${datasetId}/exportar`)
};
