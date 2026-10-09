import { TablaFrecuencia } from '../../../../domain/services/descriptive-statistics/DistribucionFrecuencias';
import { ComparacionGrupos } from '../../../../domain/services/inferential-statistics/ComparadorDeCategorias';
import { EntradaRanking } from '../../../../domain/services/classification/MotorDePriorizacion';
import { ResumenCincoNumeros } from '../../../../domain/services/descriptive-statistics/EstadisticaDescriptiva';
import { DatosHistogramaCvss, DatoConteo } from '../../../../domain/services/graphs/GraficosEstadisticos';
import { DiagnosticoColumna } from '../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { ResumenColumna } from '../../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { AnalisisUnivariado } from '../../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import { MatrizCorrelacion } from '../../../../domain/services/descriptive-statistics/CorrelacionGenerico';
import { ResultadoDeteccionOutliers } from '../../../../domain/services/data-cleaning/DeteccionOutliersGenerico';

export interface ResumenEstadisticoInforme {
  media: number;
  mediana: number;
  moda: number[];
  q1: number;
  q3: number;
  rango: number;
  varianza: number;
  desviacionEstandar: number;
  coeficienteVariacion: number;
}

// Fase 1 (retrofit del informe, mapeo confirmado contra el .qmd de
// referencia — capítulo 5, "Organización de datos"): antes el informe solo
// mostraba agregados, nunca una fila individual. Se muestran los primeros N
// registros (orden de carga) Y una muestra representativa por muestreo
// sistemático (misma técnica que la sección 5.2 del .qmd: espaciado
// uniforme sobre el total, no solo los primeros casos).
export interface FilaMuestraInforme {
  cve: string;
  software: string;
  cvssScore: number;
  severidad: string;
  tipoAcceso: string;
  estadoRemediacion: string;
  fechaCarga: Date;
}

export interface MuestraDeRegistrosInforme {
  primeros: FilaMuestraInforme[];
  representativa: FilaMuestraInforme[];
}

// Anexo A ("Dataset completo") del informe: a diferencia de MuestraDeRegistrosInforme
// (10 filas, solo para ilustrar la sección 4), el Anexo A intenta listar el
// dataset COMPLETO — salvo que exceda LIMITE_ANEXO_DATASET_COMPLETO
// (RecopilarDatosDeInforme.ts), en cuyo caso se recurre a la misma muestra
// representativa por muestreo sistemático que ya usa la sección 4, pero de
// tamaño igual al límite en vez de 10, para no generar un PDF de miles de
// páginas con un dataset grande.
export interface AnexoDatasetInforme {
  filas: FilaMuestraInforme[];
  esMuestra: boolean;
  tamanoOriginal: number;
}

// Fase 1 — capítulo 4 adaptado ("Origen y calidad de los datos"): a
// diferencia del .qmd (una tesis sobre un dataset fijo, con nombre de
// archivo y fecha de captura conocidos de antemano), SEVERA genera este
// informe bajo demanda, desacoplado de cualquier importación puntual. Lo
// único que sobrevive más allá de la respuesta HTTP de un import es el
// registro de auditoría agregado (ver AuditoriaRepository) — el detalle
// por fila rechazada NO se persiste en ningún lado (decisión confirmada:
// no se agrega una tabla nueva solo para esto). Por eso acá se expone el
// último registro de auditoría de tipo 'ImportarDataset' tal cual quedó
// guardado, en vez de fingir una estructura más rica que no existe.
export interface OrigenYCalidadDatosInforme {
  ultimoCambioRegistrado: { detalle: string; fecha: Date; usuario: string } | null;
}

export interface DatosGraficosInforme {
  histogramaCvss: DatosHistogramaCvss;
  barrasSeveridad: DatoConteo[];
  pastelSeveridad: DatoConteo[];
  boxplotCvss: ResumenCincoNumeros;
  histogramaAgrupado: DatosHistogramaCvss;
  // Bug real (2026-07-19): un catálogo sin ninguna vulnerabilidad de un tipo
  // de acceso (ej. todo Remoto, cero Local) hacía que calcularResumenCincoNumeros
  // tirara sobre una lista vacía y rompiera TODO el informe/resumen — null de
  // ese lado en vez de tirar (ver mismo criterio en ComparadorDeCategorias.compararGrupos).
  boxplotPorAcceso: { remoto: ResumenCincoNumeros | null; local: ResumenCincoNumeros | null };
  dispersionCvssDias: { puntos: Array<{ x: number; y: number }>; correlacion: number };
  histogramaDiasParche: DatosHistogramaCvss;
  topTipos: DatoConteo[];
  // Cantidad de vulnerabilidades excluidas de topTipos por no tener un tipo
  // real asignado ("Sin clasificar"/"N/A" — ver generarTopTiposClasificados
  // en GraficosEstadisticos.ts). Se informa aparte en vez de graficarse.
  totalTiposSinClasificar: number;
  topSoftware: DatoConteo[];
}

// Objeto de datos consolidado que arma RecopilarDatosDeInforme (RF-77) a
// partir del repositorio y los servicios de dominio. El caso de uso no sabe
// nada de PDF/Word: solo produce este DTO, que es lo único que conocen los
// adaptadores de salida.
export interface DatosInforme {
  generadoEn: Date;
  // Nombre del analista que pidió este informe (portada + Anexo C) — ver
  // AnalistaRepository.buscarPorId, resuelto en GenerarInforme/
  // GenerarResumenEjecutivo a partir del analistaId del token. Fallback fijo
  // si por algún motivo el id del token ya no existe en el repositorio.
  generadoPara: string;
  totalVulnerabilidades: number;
  resumenEstadistico: ResumenEstadisticoInforme;
  distribucionFrecuencias: TablaFrecuencia[];
  distribucionSinAgrupar: Array<{ valor: number; frecuencia: number }>;
  comparacionAccesoRemotoLocal: ComparacionGrupos;
  rankingUrgencia: EntradaRanking[];
  interpretacion: string[];
  muestraDeRegistros: MuestraDeRegistrosInforme;
  origenYCalidad: OrigenYCalidadDatosInforme;
  limitacionesConocidas: string[];
  graficos: DatosGraficosInforme;
  // Anexo A (GeneradorInformePDF.ts/GeneradorInformeWord.ts).
  anexoDataset: AnexoDatasetInforme;
}

// Mejora 4 (Análisis de Datos General) — Fase 5. Objeto de datos consolidado
// análogo a DatosInforme, pero para el módulo de dataset genérico: mismo
// puerto GeneradorDeInformes extendido con dos métodos nuevos (en vez de un
// puerto paralelo) porque DatosInforme es intrínsecamente específico de
// vulnerabilidades (CVE, CVSS, ranking de urgencia, acceso remoto/local) —
// no hay forma honesta de que un dataset arbitrario (columnas y tipos
// desconocidos de antemano) encaje en esa forma sin inventar campos que no
// existen. Arma RecopilarDatosDeInformeDataset a partir de los servicios de
// dominio ya usados en las Fases 2-4 de este módulo — el caso de uso no sabe
// nada de PDF/Word, solo produce este DTO.
// Anexo A del informe de dataset genérico: muestra cruda de filas (a
// diferencia de las estadísticas ya resumidas de las secciones 3/5). Las
// columnas y filas se acotan (RecopilarDatosDeInformeDataset.ts) porque un
// dataset genérico puede tener un número arbitrario de columnas — sin límite,
// una tabla con demasiadas columnas no entraría en el ancho de una página A4.
export interface AnexoMuestraFilasDataset {
  columnasMostradas: string[];
  totalColumnas: number;
  filas: Array<Record<string, unknown>>;
  totalFilas: number;
}

// Una operación de limpieza que se aplicó para llegar a la versión del
// dataset sobre la que se calcula el informe (RF-123, sección 8 de RF-130).
export interface OperacionDeLimpiezaEnInforme {
  fecha: Date;
  versionOrigen: number;
  versionResultado: number;
  operacion: 'eliminar_registros' | 'eliminar_columna' | 'imputar';
  variable: string;
  registrosAfectados: number;
  metodo: string;
  // Solo en imputaciones.
  valorImputado?: number | string | boolean;
  nota?: string;
}

// De qué dataset guardado salen los datos del informe y qué se le hizo antes.
// Un informe de datos limpiados que no dijera que lo son, ni cómo, no se
// podría reproducir ni interpretar bien (una variable imputada tiene menos
// dispersión que la observada).
export interface ProcedenciaDeDatasetEnInforme {
  nombreArchivo: string;
  // 0 = el dataset original, tal como se importó.
  version: number;
  versionBase: number | null;
  // En orden de aplicación, desde el original hasta esta versión. Vacío para
  // el original.
  operaciones: OperacionDeLimpiezaEnInforme[];
  // RF-110: solo si el analista la confirmó.
  variableObjetivo: string | null;
}

export interface DatosInformeDataset {
  // Ausente cuando la sesión no está asociada a un dataset guardado (sesiones
  // anteriores al versionado): en ese caso los datos son los importados.
  procedencia?: ProcedenciaDeDatasetEnInforme;
  generadoEn: Date;
  generadoPara: string;
  totalFilas: number;
  totalColumnas: number;
  filasDuplicadas: number;
  columnas: DiagnosticoColumna[];
  estadisticasDescriptivas: ResumenColumna[];
  analisisUnivariado: AnalisisUnivariado[];
  matrizCorrelacion: MatrizCorrelacion;
  outliers: ResultadoDeteccionOutliers;
  interpretacion: string[];
  limitacionesConocidas: string[];
  anexoMuestraFilas: AnexoMuestraFilasDataset;
}

// M-10 Ronda 2, Pasada 3: los dos "documentos de datos" bajo un mismo tipo.
// Unión discriminada (no un DTO fusionado — ver la nota de DatosInformeDataset
// arriba): un informe es de un pipeline O del otro, y cada renderer resuelve
// los dos con chequeo de exhaustividad.
export type InformeSolicitado = { pipeline: 'cvss'; datos: DatosInforme } | { pipeline: 'generico'; datos: DatosInformeDataset };

// Formatos del informe completo de 20 secciones (RF-130):
//   pdf   RF-77        docx  RF-78        html  RF-132 (página autocontenida)
//   latex RF-133 (fuente .tex + figuras, en un .zip)
//   xlsx  RF-79 (todas las tablas del informe, una por hoja)
export const FORMATOS_DE_INFORME = ['pdf', 'docx', 'html', 'latex', 'xlsx'] as const;
export type FormatoDeInforme = (typeof FORMATOS_DE_INFORME)[number];

export function esFormatoDeInforme(valor: unknown): valor is FormatoDeInforme {
  return typeof valor === 'string' && (FORMATOS_DE_INFORME as readonly string[]).includes(valor);
}

export interface OpcionesDeInforme {
  // RF-80: además del informe, incluir cada gráfico como archivo
  // independiente (PNG y SVG). El resultado pasa a ser un .zip con el informe
  // en el formato pedido más una carpeta de gráficos.
  adjuntarGraficos?: boolean;
}

// Lo que se le entrega al cliente: el contenido y cómo nombrarlo/servirlo.
// No siempre coincide con el formato pedido — LaTeX y "con gráficos" se
// entregan como .zip — así que es el generador quien lo informa, no el
// controller quien lo deduce.
export interface ArchivoGenerado {
  contenido: Buffer;
  tipoMime: string;
  extension: string;
}

export interface GeneradorDeInformes {
  // Informe completo de 20 secciones, de cualquiera de los dos pipelines, en
  // cualquiera de los formatos.
  generarInformeEnFormato(informe: InformeSolicitado, formato: FormatoDeInforme, opciones?: OpcionesDeInforme): Promise<ArchivoGenerado>;
  // RF-82: documento aparte (PDF corto), no una variante de formato del
  // informe completo.
  generarResumenEjecutivo(datos: DatosInforme): Promise<Buffer>;
}
