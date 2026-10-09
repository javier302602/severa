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

// RF-61: formatos de descarga de un gráfico suelto. El SVG no pasa por acá:
// la pantalla ya lo tiene (es lo que muestra) y se guarda tal cual.
export type FormatoDescargaGrafico = 'png' | 'pdf';

export const graficoService = {
  // Sin `formato`: el backend devuelve el SVG envuelto en JSON, que es lo
  // que muestra la pantalla.
  obtener: (tipo: TipoGrafico, limite?: number, signal?: AbortSignal): Promise<GraficoConInterpretacion> =>
    httpClient.get(`/graficos/${tipo}`, { limite }, signal),
  // Contrato verificado contra GraficoController.ts: con formato=png|pdf el
  // cuerpo es el archivo binario (image/png a 300 dpi, o application/pdf
  // vectorial) — httpClient lo entrega como Blob.
  descargar: (tipo: TipoGrafico, formato: FormatoDescargaGrafico, limite?: number): Promise<Blob> =>
    httpClient.get(`/graficos/${tipo}`, { formato, limite })
};
