import { GraficosOutputPort } from '../../../../application/ports/out/graphics/GraficosOutputPort';
import { DatoBarra, ResumenCincoNumeros, PuntoDispersion } from '../../../../domain/services/graphs/GeometriaDeGraficos';
import { dibujarBarras, dibujarBarrasHorizontales, dibujarBoxplot, dibujarDispersion, dibujarHistograma, dibujarPastel } from './SvgDibujoDeGraficos';
import {
  dibujarBarras as dibujarBarrasPdf,
  dibujarBarrasHorizontales as dibujarBarrasHorizontalesPdf,
  dibujarBoxplot as dibujarBoxplotPdf,
  dibujarDispersion as dibujarDispersionPdf,
  dibujarHistograma as dibujarHistogramaPdf,
  dibujarPastel as dibujarPastelPdf
} from '../reportes/DibujoDeGraficosPdf';
import { exportarGraficoComoPng, exportarGraficoComoPdf, DibujoEnPdf } from './ExportadorDeGraficos';

interface DatosHistograma {
  bins: Array<{ intervalo: string; frecuencia: number }>;
  media: number;
  mediana: number;
}

interface DatosDispersion {
  puntos: PuntoDispersion[];
  correlacion: number;
}

// Bug real (auditoría de cierre de Mejora 4, confirmado en vivo contra GET
// /graficos/:tipo con un dataset real cargado): esta clase nunca dibujaba
// nada — cada método ignoraba por completo el parámetro `datos` y devolvía
// siempre el mismo SVG placeholder (un rectángulo blanco con el título
// nomás), sin importar los datos reales que GenerarGrafico.ts ya calculaba
// correctamente. Ahora sí usa la geometría real (GeometriaDeGraficos.ts,
// misma que ya consume GeneradorInformePDF.ts para el PDF) a través de
// SvgDibujoDeGraficos.ts.
//
// Bug real #2 (reportado por el usuario: "las tarjetas de Gráficos solo
// dicen Histograma", confirmado en vivo contra GET /graficos/histogramaCvss,
// /histogramaCvssAgrupado y /histogramaDiasParche — los tres devuelven un
// SVG cuyo <text font-weight="bold"> interno es el string literal
// "Histograma", indistinguible entre sí): `titulo` estaba hardcodeado por
// método (uno por cada renderizarX) en vez de recibirse como parámetro, así
// que los 3 gráficos que llaman a renderizarHistograma (y, del mismo modo,
// los 2 que llaman a renderizarBarras y los 2 que llaman a
// renderizarBarrasHorizontales) terminaban con el mismo rótulo genérico
// dibujado adentro de la imagen, aunque el <h2> de la tarjeta en
// GraficosPage.tsx sí mostraba el título específico correcto. Ahora el
// título viaja desde GenerarGrafico.ts (un string por caso/tipo), así que el
// SVG queda tan específico como el título de la tarjeta que lo pidió.
export class SvgGraficosAdapter implements GraficosOutputPort {
  async renderizarHistograma(
    datos: unknown,
    formato: 'svg' | 'json' | 'png' | 'pdf',
    titulo = 'Histograma',
    etiquetaEjeX?: string
  ): Promise<unknown> {
    if (formato === 'json') return { tipo: 'histograma', datos };
    const { bins, media, mediana } = datos as DatosHistograma;
    const opciones = { titulo, etiquetaEjeX, etiquetaEjeY: 'Frecuencia' };
    return this.entregar(
      formato,
      () => dibujarHistograma(bins, media, mediana, opciones),
      (doc) => dibujarHistogramaPdf(doc, bins, media, mediana, opciones)
    );
  }

  // Bug real #3 (reportado con capturas junto a los ticks numéricos
  // faltantes): "CVSS por tipo de acceso" mostraba "Cantidad" en el eje Y
  // aunque los valores que grafica son promedios de CVSS, no conteos — el
  // rótulo de eje estaba hardcodeado igual que `titulo` lo estaba antes.
  // `etiquetaEjeY` ahora viaja desde GenerarGrafico.ts (mismo criterio que ya
  // usaba GeneradorInformePDF.ts para el PDF, que nunca tuvo este bug).
  async renderizarBarras(
    datos: unknown,
    formato: 'svg' | 'json' | 'png' | 'pdf',
    titulo = 'Barras',
    etiquetaEjeY = 'Cantidad',
    etiquetaEjeX?: string,
    nota?: string
  ): Promise<unknown> {
    if (formato === 'json') return { tipo: 'barras', datos };
    const opciones = { titulo, etiquetaEjeX, etiquetaEjeY, nota };
    return this.entregar(
      formato,
      () => dibujarBarras(datos as DatoBarra[], opciones),
      (doc) => dibujarBarrasPdf(doc, datos as DatoBarra[], opciones)
    );
  }

  async renderizarPastel(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo = 'Pastel', nota?: string): Promise<unknown> {
    if (formato === 'json') return { tipo: 'pastel', datos };
    return this.entregar(
      formato,
      () => dibujarPastel(datos as DatoBarra[], { titulo, nota }),
      (doc) => dibujarPastelPdf(doc, datos as DatoBarra[], { titulo, nota })
    );
  }

  async renderizarBoxplot(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo = 'Boxplot'): Promise<unknown> {
    if (formato === 'json') return { tipo: 'boxplot', datos };
    const opciones = { titulo, etiquetaEjeY: 'CVSS Score' };
    return this.entregar(
      formato,
      () => dibujarBoxplot(datos as ResumenCincoNumeros, opciones),
      (doc) => dibujarBoxplotPdf(doc, datos as ResumenCincoNumeros, opciones)
    );
  }

  async renderizarDispersion(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo = 'Dispersión'): Promise<unknown> {
    if (formato === 'json') return { tipo: 'dispersion', datos };
    const { puntos, correlacion } = datos as DatosDispersion;
    const opciones = { titulo, etiquetaEjeX: 'CVSS Score', etiquetaEjeY: 'Días para parche' };
    return this.entregar(
      formato,
      () => dibujarDispersion(puntos, correlacion, opciones),
      (doc) => dibujarDispersionPdf(doc, puntos, correlacion, opciones)
    );
  }

  async renderizarBarrasHorizontales(
    datos: unknown,
    formato: 'svg' | 'json' | 'png' | 'pdf',
    titulo = 'Top N',
    etiquetaEjeX = 'Cantidad'
  ): Promise<unknown> {
    if (formato === 'json') return { tipo: 'barrasHorizontales', datos };
    const opciones = { titulo, etiquetaEjeX };
    return this.entregar(
      formato,
      () => dibujarBarrasHorizontales(datos as DatoBarra[], opciones),
      (doc) => dibujarBarrasHorizontalesPdf(doc, datos as DatoBarra[], opciones)
    );
  }

  // RF-61: un mismo gráfico en los tres formatos de salida. SVG es el de la
  // pantalla; PNG y PDF son las descargas "para usar en presentaciones":
  //   - PNG: el mismo SVG rasterizado a 300 dpi;
  //   - PDF: vectorial, dibujado con las funciones que ya usa el informe
  //     (DibujoDeGraficosPdf.ts) sobre la misma geometría — no una imagen
  //     pegada en una página.
  // Durante mucho tiempo png/pdf devolvieron un SVG con el texto "Exportación
  // pendiente": la decisión era no agregar una librería de rasterizado solo
  // para esto. Esa librería (sharp) entró después por el informe Word, así
  // que el motivo dejó de existir.
  private async entregar(formato: 'svg' | 'png' | 'pdf', dibujarSvg: () => string, dibujarEnPdf: DibujoEnPdf): Promise<string | Buffer> {
    if (formato === 'png') return exportarGraficoComoPng(dibujarSvg());
    if (formato === 'pdf') return exportarGraficoComoPdf(dibujarEnPdf);
    return dibujarSvg();
  }
}
