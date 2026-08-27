import sharp from 'sharp';
import { DatosInforme } from '../../../../application/ports/out/GeneradorDeInformes';
import {
  dibujarBarras,
  dibujarBarrasHorizontales,
  dibujarHistograma,
  dibujarBoxplot,
  dibujarDispersion,
  dibujarPastel
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

async function svgAPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
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
