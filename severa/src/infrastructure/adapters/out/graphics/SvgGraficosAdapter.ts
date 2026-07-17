import { GraficosOutputPort } from '../../../../application/ports/out/GraficosOutputPort';
import { DatoBarra, ResumenCincoNumeros, PuntoDispersion } from '../../../../domain/services/GeometriaDeGraficos';
import { dibujarBarras, dibujarBarrasHorizontales, dibujarBoxplot, dibujarDispersion, dibujarHistograma, dibujarPastel } from './SvgDibujoDeGraficos';

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
    if (formato === 'png' || formato === 'pdf') {
      return this.generarSvgPendiente(formato, titulo);
    }
    const { bins, media, mediana } = datos as DatosHistograma;
    return dibujarHistograma(bins, media, mediana, { titulo, etiquetaEjeX, etiquetaEjeY: 'Frecuencia' });
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
    etiquetaEjeX?: string
  ): Promise<unknown> {
    if (formato === 'json') return { tipo: 'barras', datos };
    if (formato === 'png' || formato === 'pdf') {
      return this.generarSvgPendiente(formato, titulo);
    }
    return dibujarBarras(datos as DatoBarra[], { titulo, etiquetaEjeX, etiquetaEjeY });
  }

  async renderizarPastel(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo = 'Pastel'): Promise<unknown> {
    if (formato === 'json') return { tipo: 'pastel', datos };
    if (formato === 'png' || formato === 'pdf') {
      return this.generarSvgPendiente(formato, titulo);
    }
    return dibujarPastel(datos as DatoBarra[], { titulo });
  }

  async renderizarBoxplot(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo = 'Boxplot'): Promise<unknown> {
    if (formato === 'json') return { tipo: 'boxplot', datos };
    if (formato === 'png' || formato === 'pdf') {
      return this.generarSvgPendiente(formato, titulo);
    }
    return dibujarBoxplot(datos as ResumenCincoNumeros, { titulo, etiquetaEjeY: 'CVSS Score' });
  }

  async renderizarDispersion(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo = 'Dispersión'): Promise<unknown> {
    if (formato === 'json') return { tipo: 'dispersion', datos };
    if (formato === 'png' || formato === 'pdf') {
      return this.generarSvgPendiente(formato, titulo);
    }
    const { puntos, correlacion } = datos as DatosDispersion;
    return dibujarDispersion(puntos, correlacion, { titulo, etiquetaEjeX: 'CVSS Score', etiquetaEjeY: 'Días para parche' });
  }

  async renderizarBarrasHorizontales(
    datos: unknown,
    formato: 'svg' | 'json' | 'png' | 'pdf',
    titulo = 'Top N',
    etiquetaEjeX = 'Cantidad'
  ): Promise<unknown> {
    if (formato === 'json') return { tipo: 'barrasHorizontales', datos };
    if (formato === 'png' || formato === 'pdf') {
      return this.generarSvgPendiente(formato, titulo);
    }
    return dibujarBarrasHorizontales(datos as DatoBarra[], { titulo, etiquetaEjeX });
  }

  // RF-61: la conversión real a PNG/PDF sigue sin implementar (decisión
  // confirmada: no se agrega una librería de rasterizado SVG→PNG/PDF solo
  // para esto) — el modo SVG en pantalla, que es el que de verdad usa
  // GraficosPage.tsx, es el que se arregla acá.
  private generarSvgPendiente(formato: 'png' | 'pdf', titulo: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="400" height="200" fill="#fff"/><text x="20" y="30">${titulo}</text><text x="20" y="60">Exportación ${formato.toUpperCase()} pendiente de decidir librería de conversión SVG→${formato.toUpperCase()}.</text></svg>`;
  }
}
