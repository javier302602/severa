import { httpClient } from './httpClient';

// Los 10 tipos verificados contra GraficoController.ts. El backend genera el
// SVG server-side (Sprint 07) — el frontend NO reimplementa la
// visualización con una librería de charts, solo pide el SVG y lo muestra.
export type TipoGrafico =
  | 'histogramaCvss'
  | 'histogramaCvssAgrupado'
  | 'barrasSeveridad'
  | 'pastelSeveridad'
  | 'boxplotCvss'
  | 'dispersionCvssDias'
  | 'cvssPorAcceso'
  | 'histogramaDiasParche'
  | 'topSoftware'
  | 'topTipos';

// Contrato verificado contra GraficoController.ts/GenerarGrafico.ts: el
// formato 'svg' (el único que usa esta pantalla) ya NO manda el SVG crudo
// como body — viene envuelto en JSON junto con el texto de "análisis" de
// la Fase 1 del informe (InterpretacionDeGraficos.ts, mismo servicio que
// usan el PDF y el Word, no un texto aparte).
export interface GraficoConInterpretacion {
  svg: string;
  interpretacion: string;
}

export const graficoService = {
  // Sin `formato`: el backend por defecto devuelve SVG. PNG/PDF existen como
  // query param pero no están realmente implementados del lado del backend
  // (X-Formato-Real: svg, ver GraficoController.ts) — no se ofrecen acá.
  obtener: (tipo: TipoGrafico, limite?: number): Promise<GraficoConInterpretacion> =>
    httpClient.get(`/graficos/${tipo}`, { limite })
};
