import { httpClient } from './httpClient';
import type { Analista } from '../types/Analista';

export interface DatosEdicionPerfil {
  nombre: string;
  correo: string;
}

// Un análisis del historial del analista (RF-11), tal como lo presenta el
// backend (HistorialDeAnalisis.ts).
export interface AnalisisDelHistorial {
  id: string;
  fechaHora: string;
  tipoEvento: string;
  // El tipo de análisis en palabras ("Matriz de correlación").
  tipoDeAnalisis: string;
  // 'dataset': sobre un dataset de "Análisis de Datos". 'catalogo': sobre el
  // catálogo de vulnerabilidades.
  origen: 'dataset' | 'catalogo';
  dataset: string;
  // null si no hay un dataset guardado que reabrir.
  datasetId: string | null;
  version: number | null;
  detalle: string | null;
}

export interface PaginaDeHistorial {
  eventos: AnalisisDelHistorial[];
  // Total de análisis del historial, no de la página.
  total: number;
  limite: number;
  desplazamiento: number;
}

// Cuántos análisis se piden por página (el backend acepta hasta 200).
export const ANALISIS_POR_PAGINA = 25;

// Contratos verificados contra PerfilController.ts: GET /perfil (RF-09) y
// PUT /perfil (RF-10) — ambos toman el id exclusivamente de
// req.analistaAutenticado.id, nunca de un parámetro que este servicio pueda
// mandar.
export const perfilService = {
  obtener: (): Promise<Analista> => httpClient.get('/perfil'),
  editar: (datos: DatosEdicionPerfil): Promise<Analista> => httpClient.put('/perfil', datos),
  // RF-11: una página del historial, del análisis más reciente al más antiguo.
  listarHistorial: (pagina = 0): Promise<PaginaDeHistorial> =>
    httpClient.get('/perfil/historial', { limite: ANALISIS_POR_PAGINA, desplazamiento: pagina * ANALISIS_POR_PAGINA }),
  // RF-14: el historial completo como libro de Excel.
  exportarHistorial: (): Promise<Blob> => httpClient.get('/perfil/historial/exportar')
};
