import { AnalisisRealizado } from '../../entities/AnalisisRealizado';

// RF-11 / RF-14 (M-02). Qué se anota en el historial del analista y cómo se
// le muestra. El historial responde a "qué análisis hice, cuándo y sobre qué
// dataset" — no es la auditoría (M-12), que registra operaciones para el
// administrador, ni la bitácora de un dataset (RF-123), que registra cómo se
// transformaron sus datos.
//
// Dos orígenes:
//   - 'dataset':  un análisis sobre un dataset cargado en "Análisis de Datos"
//                 (pipeline genérico). Se puede reabrir: el dataset queda
//                 guardado con sus versiones.
//   - 'catalogo': un análisis sobre el catálogo de vulnerabilidades del
//                 analista (caso especializado de ciberseguridad).
export type OrigenDeAnalisis = 'dataset' | 'catalogo';

export const TIPOS_DE_ANALISIS_DE_DATASET = [
  'DatasetCargado',
  'EstadisticasDescriptivas',
  'AnalisisUnivariado',
  'MatrizDeCorrelacion',
  'ValoresAtipicos',
  'CalidadDeDatos',
  'SerieDeTiempo',
  'VariableObjetivo',
  'LimpiezaDeDatos',
  'InformeDeDataset'
] as const;

export const TIPOS_DE_ANALISIS_DEL_CATALOGO = [
  'ResumenEstadistico',
  'DistribucionDeFrecuencias',
  'Graficos',
  'ComparacionPorCategorias',
  'RankingDeUrgencia',
  'InformeGenerado',
  'ResumenEjecutivo'
] as const;

export type TipoDeAnalisisDeDataset = (typeof TIPOS_DE_ANALISIS_DE_DATASET)[number];
export type TipoDeAnalisisDelCatalogo = (typeof TIPOS_DE_ANALISIS_DEL_CATALOGO)[number];
export type TipoDeAnalisisRealizado = TipoDeAnalisisDeDataset | TipoDeAnalisisDelCatalogo;

// El "tipo de análisis realizado" que pide RF-14, en palabras del analista.
export const ETIQUETA_DE_TIPO_DE_ANALISIS: Record<TipoDeAnalisisRealizado, string> = {
  DatasetCargado: 'Carga y detección de variables',
  EstadisticasDescriptivas: 'Estadísticas descriptivas',
  AnalisisUnivariado: 'Análisis univariado',
  MatrizDeCorrelacion: 'Matriz de correlación',
  ValoresAtipicos: 'Detección de valores atípicos',
  CalidadDeDatos: 'Diagnóstico de calidad de datos',
  SerieDeTiempo: 'Evaluación de serie de tiempo',
  VariableObjetivo: 'Sugerencia de variable objetivo',
  LimpiezaDeDatos: 'Limpieza de datos',
  InformeDeDataset: 'Informe completo',
  ResumenEstadistico: 'Resumen estadístico',
  DistribucionDeFrecuencias: 'Distribución de frecuencias',
  Graficos: 'Gráficos estadísticos',
  ComparacionPorCategorias: 'Comparación por categorías',
  RankingDeUrgencia: 'Ranking de urgencia',
  InformeGenerado: 'Informe completo',
  ResumenEjecutivo: 'Resumen ejecutivo'
};

export const DATASET_DEL_CATALOGO = 'Catálogo de vulnerabilidades';
export const DATASET_SIN_GUARDAR = 'Dataset sin guardar';

function esTipoConocido(tipoEvento: string): tipoEvento is TipoDeAnalisisRealizado {
  return Object.prototype.hasOwnProperty.call(ETIQUETA_DE_TIPO_DE_ANALISIS, tipoEvento);
}

export function origenDeTipoDeAnalisis(tipo: TipoDeAnalisisRealizado): OrigenDeAnalisis {
  return (TIPOS_DE_ANALISIS_DE_DATASET as readonly string[]).includes(tipo) ? 'dataset' : 'catalogo';
}

// Lo que se guarda en `payload` de AnalisisRealizado. El nombre del dataset y
// su versión se copian en el momento del análisis: el historial tiene que
// seguir diciendo sobre qué se trabajó aunque el dataset ya no exista.
export interface DatosDeAnalisisRealizado {
  dataset: string;
  datasetId?: string;
  version?: number;
  detalle?: string;
}

export function nombreDeVersionDeDataset(version: number): string {
  return version === 0 ? 'original' : `versión ${version}`;
}

// Un evento del historial listo para mostrar o exportar.
export interface AnalisisRealizadoPresentado {
  id: string;
  fechaHora: Date;
  tipoEvento: string;
  tipoDeAnalisis: string;
  origen: OrigenDeAnalisis;
  dataset: string;
  // null si el análisis no fue sobre un dataset guardado (catálogo, o una
  // sesión sin dataset detrás): no hay nada que reabrir por id.
  datasetId: string | null;
  version: number | null;
  detalle: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

// Tolera los eventos anteriores a esta ronda (solo existía 'InformeGenerado'
// con payload {formato}, siempre del catálogo) y cualquier tipo desconocido:
// se muestra tal cual en vez de esconderlo.
export function presentarAnalisisRealizado(evento: AnalisisRealizado): AnalisisRealizadoPresentado {
  const { payload } = evento;
  const conocido = esTipoConocido(evento.tipoEvento);
  const origen: OrigenDeAnalisis = conocido ? origenDeTipoDeAnalisis(evento.tipoEvento as TipoDeAnalisisRealizado) : texto(payload.datasetId) ? 'dataset' : 'catalogo';
  const formato = texto(payload.formato);

  return {
    id: evento.id,
    fechaHora: evento.fechaHora,
    tipoEvento: evento.tipoEvento,
    tipoDeAnalisis: conocido ? ETIQUETA_DE_TIPO_DE_ANALISIS[evento.tipoEvento as TipoDeAnalisisRealizado] : evento.tipoEvento,
    origen,
    dataset: texto(payload.dataset) ?? (origen === 'catalogo' ? DATASET_DEL_CATALOGO : DATASET_SIN_GUARDAR),
    datasetId: texto(payload.datasetId),
    version: typeof payload.version === 'number' && Number.isInteger(payload.version) ? payload.version : null,
    detalle: texto(payload.detalle) ?? (formato ? `Formato ${formato.toUpperCase()}` : null)
  };
}

// Clave de un evento que solo debe anotarse una vez (un análisis que el
// analista consulta veinte veces en la misma sesión de trabajo es un
// análisis, no veinte). Quien registra deriva de ella un id determinista:
// dos intentos con la misma clave producen el mismo id y el segundo no se
// guarda (ver RegistrarEnHistorialDeAnalisis).
export function claveDeAnalisisDeSesion(sesionId: string, tipo: TipoDeAnalisisDeDataset): string {
  return `sesion:${sesionId}:${tipo}`;
}

// El catálogo no tiene sesiones: un mismo tipo de análisis se anota a lo
// sumo una vez por día (UTC).
export function claveDeAnalisisDelDia(fecha: Date, tipo: TipoDeAnalisisDelCatalogo): string {
  return `dia:${fecha.toISOString().slice(0, 10)}:${tipo}`;
}
