import sharp from 'sharp';
import { DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import type { AnalisisUnivariadoNumerico } from '../../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import {
  dibujarBarras,
  dibujarBarrasHorizontales,
  dibujarHistograma,
  dibujarBoxplot,
  dibujarDispersion,
  dibujarPastel,
  dibujarHeatmap
} from '../graphics/SvgDibujoDeGraficos';

// Bug real reportado: el .docx solo tenía encabezados y tablas de datos, sin
// los gráficos dibujados (a diferencia del PDF). Decisión anterior de este
// proyecto (ver comentario en GeneradorInformeWord.ts) fue no rasterizar
// SVG→PNG para evitar una dependencia nueva — revertida acá, confirmada con
// el usuario, agregando "sharp". Se reusan EXACTAMENTE las mismas funciones
// de dibujo SVG que ya sirven /graficos/:tipo en pantalla (SvgDibujoDeGraficos.ts)
// en vez de duplicar lógica de dibujo para Word.
export const ANCHO_IMAGEN_GRAFICO = 460;
export const ALTO_IMAGEN_GRAFICO = 240;

// Los SVG de SvgDibujoDeGraficos.ts solo declaran viewBox (460 de ancho), y
// librsvg los rasteriza a 72 dpi salvo que se le pida otra cosa: 460 píxeles
// para una figura que en la página ocupa casi 5 pulgadas, texto borroso en
// pantalla y peor impreso. Se rasteriza al triple; el tamaño con el que la
// figura se coloca en el documento (ANCHO/ALTO_IMAGEN_GRAFICO) no cambia.
const ESCALA_RASTERIZADO = 3;
const DENSIDAD_RASTERIZADO = 72 * ESCALA_RASTERIZADO;

async function svgAPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: DENSIDAD_RASTERIZADO }).png().toBuffer();
}

// Orden y contenido idénticos a construirDefinicionesGraficosWord() en
// GeneradorInformeWord.ts (10 gráficos, mismo índice base 0). El Gráfico 6
// (comparación de acceso) usa un gráfico de barras de las medias en vez del
// boxplot doble del PDF — SvgDibujoDeGraficos.ts no tiene una versión SVG de
// boxplot doble (esa geometría solo existe hoy en DibujoDeGraficosPdf.ts,
// construida específicamente para el informe en PDF) y no se justifica
// escribir una segunda implementación de dibujo solo para esto; el gráfico
// de barras usa los mismos promedios que ya muestra el análisis de esta
// sección.
export async function generarImagenesDeGraficosInforme(datos: DatosInforme): Promise<Buffer[]> {
  const g = datos.graficos;
  const remotoVsLocal = datos.comparacionAccesoRemotoLocal;

  const svgs = [
    dibujarHistograma(g.histogramaCvss.bins, g.histogramaCvss.media, g.histogramaCvss.mediana, {
      titulo: 'Histograma de CVSS Score',
      etiquetaEjeX: 'CVSS Score',
      etiquetaEjeY: 'Frecuencia'
    }),
    dibujarBarras(g.barrasSeveridad, { titulo: 'Distribución por severidad', etiquetaEjeX: 'Severidad', etiquetaEjeY: 'Cantidad' }),
    dibujarPastel(g.pastelSeveridad, { titulo: 'Composición por severidad' }),
    dibujarBoxplot(g.boxplotCvss, { titulo: 'Boxplot de CVSS Score', etiquetaEjeY: 'CVSS Score' }),
    dibujarHistograma(g.histogramaAgrupado.bins, g.histogramaAgrupado.media, g.histogramaAgrupado.mediana, {
      titulo: 'Histograma agrupado',
      etiquetaEjeX: 'CVSS Score',
      etiquetaEjeY: 'Frecuencia'
    }),
    dibujarBarras(
      [
        { etiqueta: 'Remoto', valor: remotoVsLocal.mediaA ?? 0 },
        { etiqueta: 'Local', valor: remotoVsLocal.mediaB ?? 0 }
      ],
      { titulo: 'CVSS por tipo de acceso', etiquetaEjeX: 'Tipo de acceso', etiquetaEjeY: 'CVSS Score promedio' }
    ),
    dibujarDispersion(g.dispersionCvssDias.puntos, g.dispersionCvssDias.correlacion, {
      titulo: 'CVSS vs. Días para parche',
      etiquetaEjeX: 'CVSS Score',
      etiquetaEjeY: 'Días para parche'
    }),
    dibujarHistograma(g.histogramaDiasParche.bins, g.histogramaDiasParche.media, g.histogramaDiasParche.mediana, {
      titulo: 'Distribución de Días para Parche',
      etiquetaEjeX: 'Días para parche',
      etiquetaEjeY: 'Frecuencia'
    }),
    dibujarBarrasHorizontales(g.topTipos, { titulo: 'Tipos de vulnerabilidad más frecuentes', etiquetaEjeX: 'Cantidad' }),
    dibujarBarrasHorizontales(g.topSoftware, { titulo: 'Software más afectado', etiquetaEjeX: 'Cantidad' })
  ];

  return Promise.all(svgs.map(svgAPng));
}

// M-10 Ronda 2, Pasada 2-D Paso 2 (RF-130): figuras del informe Word del
// pipeline genérico — un histograma por columna numérica y, si hay columnas
// elegibles, el heatmap de correlación. Mismo orden que la galería de §12 del
// PDF (dibujarSeccionVisualizaciones, caso 'generico') y que el índice de
// figuras del Anexo B, así los tres numeran igual. A diferencia de las 10
// figuras fijas de CVSS, acá cada imagen informa su propio tamaño: el heatmap
// crece con la cantidad de columnas (ver SvgDibujoDeGraficos.dibujarHeatmap).
export interface FiguraInformeDataset {
  titulo: string;
  imagen: Buffer;
  ancho: number;
  alto: number;
}

// ancho/alto son el tamaño de colocación en el documento (las unidades del
// viewBox del SVG), no los píxeles del PNG, que es ESCALA_RASTERIZADO veces
// más grande.
async function figuraDesdeSvg(titulo: string, svg: string): Promise<FiguraInformeDataset> {
  const { data, info } = await sharp(Buffer.from(svg), { density: DENSIDAD_RASTERIZADO }).png().toBuffer({ resolveWithObject: true });
  return { titulo, imagen: data, ancho: Math.round(info.width / ESCALA_RASTERIZADO), alto: Math.round(info.height / ESCALA_RASTERIZADO) };
}

export async function generarFigurasDeInformeDataset(datos: DatosInformeDataset): Promise<FiguraInformeDataset[]> {
  const numericas = datos.analisisUnivariado.filter((analisis): analisis is AnalisisUnivariadoNumerico => analisis.tipo === 'numerica');

  const pendientes = numericas.map((analisis) => {
    const titulo = `Distribución de "${analisis.nombre}"`;
    return figuraDesdeSvg(
      titulo,
      dibujarHistograma(
        analisis.distribucion.map((bin) => ({ intervalo: bin.intervalo, frecuencia: bin.frecuenciaAbsoluta })),
        analisis.resumenCincoNumeros.media,
        analisis.resumenCincoNumeros.mediana,
        { titulo, etiquetaEjeX: analisis.nombre, etiquetaEjeY: 'Frecuencia' }
      )
    );
  });

  if (datos.matrizCorrelacion.columnas.length > 0) {
    const titulo = 'Heatmap de correlación de Pearson';
    pendientes.push(figuraDesdeSvg(titulo, dibujarHeatmap(datos.matrizCorrelacion, { titulo })));
  }

  return Promise.all(pendientes);
}
