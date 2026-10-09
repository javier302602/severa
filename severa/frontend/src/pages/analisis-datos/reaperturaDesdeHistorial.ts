// RF-11: "el analista puede reabrir un análisis previo". El historial manda a
// Análisis de Datos con el dataset (la versión exacta sobre la que se hizo el
// análisis) y la pestaña de ese análisis, como estado de navegación.

export type PestanaDeAnalisis = 'descriptivas' | 'univariado' | 'correlacion' | 'outliers' | 'serie' | 'objetivo' | 'limpieza' | 'versiones' | 'plantillas';

export interface SolicitudDeReapertura {
  datasetId: string;
  pestana: PestanaDeAnalisis;
}

// La pestaña que muestra cada tipo de análisis del historial. Lo que no tiene
// pestaña propia (la carga, el diagnóstico de calidad, el informe) abre la
// primera.
const PESTANA_POR_TIPO: Record<string, PestanaDeAnalisis> = {
  EstadisticasDescriptivas: 'descriptivas',
  AnalisisUnivariado: 'univariado',
  MatrizDeCorrelacion: 'correlacion',
  ValoresAtipicos: 'outliers',
  SerieDeTiempo: 'serie',
  VariableObjetivo: 'objetivo',
  LimpiezaDeDatos: 'versiones'
};

export function pestanaDeAnalisis(tipoEvento: string): PestanaDeAnalisis {
  return PESTANA_POR_TIPO[tipoEvento] ?? 'descriptivas';
}

const PESTANAS: readonly string[] = ['descriptivas', 'univariado', 'correlacion', 'outliers', 'serie', 'objetivo', 'limpieza', 'versiones', 'plantillas'];

// El estado de navegación lo puede haber escrito cualquiera (otra pantalla,
// una versión vieja guardada en el historial del navegador): se valida antes
// de usarlo.
export function leerSolicitudDeReapertura(estado: unknown): SolicitudDeReapertura | null {
  if (typeof estado !== 'object' || estado === null) return null;
  const { reabrir } = estado as { reabrir?: unknown };
  if (typeof reabrir !== 'object' || reabrir === null) return null;

  const { datasetId, pestana } = reabrir as { datasetId?: unknown; pestana?: unknown };
  if (typeof datasetId !== 'string' || datasetId === '') return null;
  return { datasetId, pestana: typeof pestana === 'string' && PESTANAS.includes(pestana) ? (pestana as PestanaDeAnalisis) : 'descriptivas' };
}
