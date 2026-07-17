import {
  calcularGeometriaBarras,
  calcularGeometriaBarrasHorizontales,
  calcularGeometriaBoxplot,
  calcularGeometriaDispersion,
  calcularGeometriaPastel,
  puntoEnCirculo,
  type DatoBarra,
  type ResumenCincoNumeros,
  type PuntoDispersion,
  type Lienzo,
  type MarcasDeEje,
  type AreaDeTrazado
} from '../../../../domain/services/GeometriaDeGraficos';

// Bug real (auditoría de cierre de Mejora 4, confirmado en vivo contra
// GET /graficos/:tipo): SvgGraficosAdapter.ts nunca dibujaba nada — siempre
// devolvía el mismo placeholder ("Exportación pendiente...") sin importar
// los datos reales. Este archivo es el equivalente SVG de
// DibujoDeGraficosPdf.ts: misma geometría pura de GeometriaDeGraficos.ts
// (Fase 0c), el mismo dato de entrada, la única diferencia real es el
// renderer de salida (SVG en vez de llamadas a pdfkit) — ninguna función de
// acá decide posiciones, solo las traduce a marcado SVG.
const ANCHO = 460;
const ALTO = 240;

const COLOR_TEXTO = '#1e293b';
const COLOR_TEXTO_SECUNDARIO = '#64748b';
const COLOR_EJE = '#334155';
const COLOR_BARRA_PRIMARIA = '#4682B4';
const COLOR_LINEA_MEDIA = '#dc2626';
const COLOR_LINEA_MEDIANA = '#16a34a';
const COLORES_SEVERIDAD: Record<string, string> = {
  Crítica: '#8B0000',
  Alta: '#ff8c00',
  Media: '#ffd700',
  Baja: '#add8e6'
};

export interface OpcionesGraficoSvg {
  titulo: string;
  etiquetaEjeX?: string;
  etiquetaEjeY?: string;
  colorBarra?: string;
}

// Los datos que llegan acá (etiquetas de software, tipo de vulnerabilidad,
// etc.) son texto libre importado por el analista — a diferencia del PDF
// (pdfkit no interpreta el texto como marcado), acá SÍ hay que escapar los
// caracteres especiales de XML: sin esto, una etiqueta con "&", "<" o ">"
// generaba un SVG mal formado que el navegador no podía parsear (el widget
// completo desaparecía, no solo esa barra).
function escaparXml(valor: string): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bug real reportado con capturas: valores como el CVSS promedio por tipo de
// acceso se mostraban tal cual venían de calcularMedia() — ej.
// "6.422989798377748" — porque String(valor) no redondea nada. Los conteos
// (severidad, frecuencias de histograma, Top N) ya son enteros y no se ven
// afectados; esto solo cambia el caso de valores con decimales de sobra.
function formatearNumero(valor: number): string {
  if (Number.isInteger(valor)) return String(valor);
  return String(Number(valor.toFixed(2)));
}

// Aproximación de ancho de texto sin medición real (no hay DOM/Canvas en el
// servidor para llamar a getComputedTextLength/measureText): un promedio de
// ~0.55× el tamaño de fuente por carácter es el heurístico estándar para
// Helvetica/Arial en texto sin medir (el mismo orden de magnitud que usan
// generadores de PDF/reportes sin motor de layout de texto disponible).
// Sin esto, un nombre de software largo en el Top 10 se dibuja igual sin
// importar cuánto mida, y termina solapando la barra o saliendo del lienzo.
const ANCHO_PROMEDIO_CARACTER = 0.55;

function truncarTexto(valor: string, anchoMaximo: number, tamano: number): string {
  const anchoCaracter = tamano * ANCHO_PROMEDIO_CARACTER;
  const maxCaracteres = Math.max(1, Math.floor(anchoMaximo / anchoCaracter));
  if (valor.length <= maxCaracteres) return valor;
  return `${valor.slice(0, Math.max(1, maxCaracteres - 1))}…`;
}

// Bug real reportado con capturas en modo oscuro: el texto de Top N
// (nombre de software/tipo) y la leyenda del pastel usan el color de texto
// por defecto (#1e293b), que es EXACTAMENTE el mismo hex que
// dark:bg-slate-800 (el fondo de la tarjeta) — el texto no faltaba, estaba
// dibujado con el mismo color que el fondo detrás. La paleta de colores de
// este archivo (COLOR_TEXTO, COLOR_EJE, etc.) siempre asumió un fondo claro
// — nunca fue realmente "sin fondo", solo dependía implícitamente del fondo
// claro de la página que lo rodeaba, supuesto que dejó de cumplirse cuando
// la tarjeta pasó a ser oscura. En vez de mantener dos paletas de color
// (clara/oscura) y tener que enterarse del tema del cliente en cada
// petición, el SVG lleva su propio fondo blanco fijo — el mismo criterio
// que ya usa el placeholder de PNG/PDF pendiente (generarSvgPendiente) más
// abajo, y consistente con que el informe PDF/Word (siempre sobre página
// blanca) jamás tuvo este problema.
function fondoBlanco(ancho: number, alto: number): string {
  return `<rect x="0" y="0" width="${ancho}" height="${alto}" fill="#ffffff" />`;
}

function envolverSvg(contenido: string, alto: number = ALTO): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${alto}" font-family="Helvetica, Arial, sans-serif">${fondoBlanco(ANCHO, alto)}${contenido}</svg>`;
}

function texto(
  x: number,
  y: number,
  valor: string,
  opciones: { tamano?: number; color?: string; ancla?: 'start' | 'middle' | 'end'; negrita?: boolean } = {}
): string {
  const { tamano = 9, color = COLOR_TEXTO, ancla = 'start', negrita = false } = opciones;
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${tamano}" fill="${color}" text-anchor="${ancla}"${
    negrita ? ' font-weight="bold"' : ''
  }>${escaparXml(valor)}</text>`;
}

function titulo(valor: string): string {
  return texto(8, 16, valor, { tamano: 11, negrita: true });
}

function ejes(area: { x: number; y: number; ancho: number; alto: number }): string {
  return (
    `<line x1="${area.x}" y1="${area.y}" x2="${area.x}" y2="${area.y + area.alto}" stroke="${COLOR_EJE}" />` +
    `<line x1="${area.x}" y1="${area.y + area.alto}" x2="${area.x + area.ancho}" y2="${area.y + area.alto}" stroke="${COLOR_EJE}" />`
  );
}

// Marcas numéricas del eje Y (vertical, a la izquierda): usadas por barras
// verticales/histogramas/boxplot. `marcas` viene de calcularMarcasDeEje —
// esta función solo las traduce a un trazo corto + el número, nunca decide
// QUÉ números mostrar (eso es responsabilidad de GeometriaDeGraficos.ts).
function marcasEjeVertical(marcas: MarcasDeEje, area: AreaDeTrazado): string {
  const rango = marcas.maximo - marcas.minimo || 1;
  return marcas.valores
    .map((valor) => {
      const y = area.y + area.alto - ((valor - marcas.minimo) / rango) * area.alto;
      return (
        `<line x1="${(area.x - 3).toFixed(1)}" y1="${y.toFixed(1)}" x2="${area.x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${COLOR_EJE}" />` +
        texto(area.x - 5, y + 2.5, formatearNumero(valor), { tamano: 6, color: COLOR_TEXTO_SECUNDARIO, ancla: 'end' })
      );
    })
    .join('');
}

// Marcas numéricas del eje X (horizontal, abajo): usadas por barras
// horizontales (Top N, donde el eje de valor es horizontal) y por ambos
// ejes de la dispersión.
function marcasEjeHorizontal(marcas: MarcasDeEje, area: AreaDeTrazado): string {
  const rango = marcas.maximo - marcas.minimo || 1;
  return marcas.valores
    .map((valor) => {
      const x = area.x + ((valor - marcas.minimo) / rango) * area.ancho;
      return (
        `<line x1="${x.toFixed(1)}" y1="${(area.y + area.alto).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(area.y + area.alto + 3).toFixed(1)}" stroke="${COLOR_EJE}" />` +
        texto(x, area.y + area.alto + 12, formatearNumero(valor), { tamano: 6, color: COLOR_TEXTO_SECUNDARIO, ancla: 'middle' })
      );
    })
    .join('');
}

function etiquetasEjes(etiquetaEjeX: string | undefined, etiquetaEjeY: string | undefined, area: { x: number; y: number; ancho: number; alto: number }): string {
  let salida = '';
  if (etiquetaEjeY) {
    salida += texto(area.x - 6, area.y - 6, etiquetaEjeY, { tamano: 7, color: COLOR_TEXTO_SECUNDARIO, ancla: 'start' });
  }
  if (etiquetaEjeX) {
    salida += texto(area.x + area.ancho / 2, area.y + area.alto + 26, etiquetaEjeX, {
      tamano: 7,
      color: COLOR_TEXTO_SECUNDARIO,
      ancla: 'middle'
    });
  }
  return salida;
}

const LIENZO_POR_DEFECTO: Lienzo = { ancho: ANCHO, alto: ALTO };

export function dibujarBarras(datos: DatoBarra[], opciones: OpcionesGraficoSvg): string {
  const { barras, area, marcasEje } = calcularGeometriaBarras(datos, LIENZO_POR_DEFECTO);

  const barrasSvg = barras
    .map(
      (barra) =>
        `<rect x="${barra.x.toFixed(1)}" y="${barra.y.toFixed(1)}" width="${barra.ancho.toFixed(1)}" height="${Math.max(0, barra.alto).toFixed(1)}" fill="${opciones.colorBarra ?? COLOR_BARRA_PRIMARIA}" stroke="${COLOR_EJE}" />` +
        texto(barra.x + barra.ancho / 2, barra.y - 4, formatearNumero(barra.valor), { tamano: 7, ancla: 'middle' }) +
        texto(barra.x + barra.ancho / 2, area.y + area.alto + 12, barra.etiqueta, { tamano: 7, color: COLOR_TEXTO_SECUNDARIO, ancla: 'middle' })
    )
    .join('');

  return envolverSvg(
    titulo(opciones.titulo) +
      ejes(area) +
      marcasEjeVertical(marcasEje, area) +
      etiquetasEjes(opciones.etiquetaEjeX, opciones.etiquetaEjeY, area) +
      barrasSvg
  );
}

// Antes no dibujaba NINGÚN eje (ni la línea, mucho menos marcas numéricas) —
// confirmado en vivo contra GET /graficos/topSoftware y /topTipos: el único
// número visible era el valor pegado a cada barra, sin escala de referencia.
const MARGEN_ABAJO_BARRAS_HORIZONTALES = 26;

export function dibujarBarrasHorizontales(datos: DatoBarra[], opciones: OpcionesGraficoSvg): string {
  const lienzo: Lienzo = {
    ancho: ANCHO,
    alto: Math.max(ALTO, 30 + MARGEN_ABAJO_BARRAS_HORIZONTALES + datos.length * 24),
    margen: { arriba: 30, abajo: MARGEN_ABAJO_BARRAS_HORIZONTALES, izquierda: 130, derecha: 30 }
  };
  const { barras, area, marcasEje } = calcularGeometriaBarrasHorizontales(datos, lienzo);

  const barrasSvg = barras
    .map(
      (barra) =>
        texto(122, barra.y + barra.alto / 2 + 3, truncarTexto(barra.etiqueta, 112, 7), { tamano: 7, ancla: 'end' }) +
        `<rect x="${barra.x.toFixed(1)}" y="${barra.y.toFixed(1)}" width="${Math.max(0, barra.ancho).toFixed(1)}" height="${barra.alto.toFixed(1)}" fill="${opciones.colorBarra ?? COLOR_BARRA_PRIMARIA}" stroke="${COLOR_EJE}" />` +
        texto(barra.x + barra.ancho + 4, barra.y + barra.alto / 2 + 3, formatearNumero(barra.valor), { tamano: 7 })
    )
    .join('');

  const contenido =
    titulo(opciones.titulo) +
    ejes(area) +
    marcasEjeHorizontal(marcasEje, area) +
    etiquetasEjes(opciones.etiquetaEjeX, undefined, area) +
    barrasSvg;

  return envolverSvg(contenido, lienzo.alto);
}

export function dibujarHistograma(
  bins: Array<{ intervalo: string; frecuencia: number }>,
  media: number,
  mediana: number,
  opciones: OpcionesGraficoSvg
): string {
  const svgBarras = dibujarBarras(
    bins.map((bin) => ({ etiqueta: bin.intervalo, valor: bin.frecuencia })),
    opciones
  );
  // dibujarBarras ya envuelve en <svg>; se inserta el resumen de media/mediana
  // como contenido adicional antes del cierre, en vez de duplicar todo el
  // dibujo de barras acá.
  const resumen = texto(ANCHO - 140, 16, `Media=${media.toFixed(2)}`, { tamano: 7, color: COLOR_LINEA_MEDIA, ancla: 'start' }) +
    texto(ANCHO - 140, 28, `Mediana=${mediana.toFixed(2)}`, { tamano: 7, color: COLOR_LINEA_MEDIANA, ancla: 'start' });

  return svgBarras.replace('</svg>', `${resumen}</svg>`);
}

// Distancia mínima en Y entre dos etiquetas de valor consecutivas: sin esto,
// un boxplot con Q1/mediana/Q3 muy cercanos entre sí (distribución poco
// dispersa) dibuja los números superpuestos e ilegibles.
const ESPACIO_MINIMO_ETIQUETAS_BOXPLOT = 9;

export function dibujarBoxplot(resumen: ResumenCincoNumeros, opciones: OpcionesGraficoSvg): string {
  const geometria = calcularGeometriaBoxplot(resumen, LIENZO_POR_DEFECTO);

  const caja = `<rect x="${geometria.caja.x.toFixed(1)}" y="${geometria.caja.y.toFixed(1)}" width="${geometria.caja.ancho.toFixed(1)}" height="${Math.max(0, geometria.caja.alto).toFixed(1)}" fill="#fca5a5" stroke="${COLOR_EJE}" stroke-width="1.5" />`;

  const linea = (segmento: { x1: number; y1: number; x2: number; y2: number }, color: string, ancho = 1.5) =>
    `<line x1="${segmento.x1.toFixed(1)}" y1="${segmento.y1.toFixed(1)}" x2="${segmento.x2.toFixed(1)}" y2="${segmento.y2.toFixed(1)}" stroke="${color}" stroke-width="${ancho}" />`;

  const mediana = linea(geometria.lineaMediana, COLOR_EJE, 2);
  const bigoteInf = linea(geometria.bigoteInferior, COLOR_EJE, 2);
  const bigoteSup = linea(geometria.bigoteSuperior, COLOR_EJE, 2);

  const p = geometria.puntoMedia;
  const media =
    `<line x1="${(p.x - 4).toFixed(1)}" y1="${(p.y - 4).toFixed(1)}" x2="${(p.x + 4).toFixed(1)}" y2="${(p.y + 4).toFixed(1)}" stroke="${COLOR_LINEA_MEDIA}" stroke-width="1.5" />` +
    `<line x1="${(p.x - 4).toFixed(1)}" y1="${(p.y + 4).toFixed(1)}" x2="${(p.x + 4).toFixed(1)}" y2="${(p.y - 4).toFixed(1)}" stroke="${COLOR_LINEA_MEDIA}" stroke-width="1.5" />`;

  // Bug real reportado con capturas: el boxplot no mostraba NINGÚN número —
  // ni siquiera el resumen de cinco números que la geometría ya calculaba.
  // Se dibuja cada valor a la derecha de la caja/bigotes, en el mismo Y que
  // su línea; si dos quedan a menos de ESPACIO_MINIMO_ETIQUETAS_BOXPLOT px
  // (distribución poco dispersa), se omite la más cercana a la anterior en
  // vez de superponer texto ilegible.
  const xEtiqueta = geometria.caja.x + geometria.caja.ancho + 6;
  const candidatas = [
    { y: geometria.bigoteSuperior.y2, valor: resumen.maximo, color: COLOR_TEXTO },
    { y: geometria.caja.y, valor: resumen.q3, color: COLOR_TEXTO },
    { y: geometria.lineaMediana.y1, valor: resumen.mediana, color: COLOR_TEXTO },
    { y: geometria.puntoMedia.y, valor: resumen.media, color: COLOR_LINEA_MEDIA },
    { y: geometria.caja.y + geometria.caja.alto, valor: resumen.q1, color: COLOR_TEXTO },
    { y: geometria.bigoteInferior.y2, valor: resumen.minimo, color: COLOR_TEXTO }
  ].sort((a, b) => a.y - b.y);

  let ultimaY = -Infinity;
  const etiquetasBoxplot = candidatas
    .filter((candidata) => {
      const cabe = candidata.y - ultimaY >= ESPACIO_MINIMO_ETIQUETAS_BOXPLOT;
      if (cabe) ultimaY = candidata.y;
      return cabe;
    })
    .map((candidata) => texto(xEtiqueta, candidata.y + 2.5, formatearNumero(candidata.valor), { tamano: 6, color: candidata.color }))
    .join('');

  return envolverSvg(
    titulo(opciones.titulo) +
      ejes(geometria.area) +
      marcasEjeVertical(geometria.marcasEje, geometria.area) +
      etiquetasEjes(undefined, opciones.etiquetaEjeY, geometria.area) +
      caja +
      mediana +
      bigoteInf +
      bigoteSup +
      media +
      etiquetasBoxplot
  );
}

export function dibujarDispersion(puntos: PuntoDispersion[], correlacion: number, opciones: OpcionesGraficoSvg): string {
  const geometria = calcularGeometriaDispersion(puntos, LIENZO_POR_DEFECTO);

  const circulos = geometria.puntos
    .map((punto) => `<circle cx="${punto.cx.toFixed(1)}" cy="${punto.cy.toFixed(1)}" r="2.5" fill="${COLOR_BARRA_PRIMARIA}" />`)
    .join('');

  const lineaTendencia = geometria.lineaTendencia
    ? `<line x1="${geometria.lineaTendencia.x1.toFixed(1)}" y1="${geometria.lineaTendencia.y1.toFixed(1)}" x2="${geometria.lineaTendencia.x2.toFixed(1)}" y2="${geometria.lineaTendencia.y2.toFixed(1)}" stroke="${COLOR_LINEA_MEDIA}" stroke-width="1.5" />`
    : '';

  const etiquetaCorrelacion = texto(8, ALTO - 6, `Correlación de Pearson = ${correlacion.toFixed(3)}`, {
    tamano: 7,
    color: COLOR_TEXTO_SECUNDARIO
  });

  // Bug real reportado con capturas: la dispersión tenía nombre de eje
  // ("CVSS Score" / "Días para parche") pero ninguna marca numérica — sin
  // datos, era imposible leer a qué valor real correspondía cada punto.
  const marcas = geometria.marcasEjeX && geometria.marcasEjeY
    ? marcasEjeHorizontal(geometria.marcasEjeX, geometria.area) + marcasEjeVertical(geometria.marcasEjeY, geometria.area)
    : '';

  return envolverSvg(
    titulo(opciones.titulo) +
      ejes(geometria.area) +
      marcas +
      etiquetasEjes(opciones.etiquetaEjeX, opciones.etiquetaEjeY, geometria.area) +
      circulos +
      lineaTendencia +
      etiquetaCorrelacion
  );
}

export function dibujarPastel(datos: DatoBarra[], opciones: OpcionesGraficoSvg): string {
  const lienzo: Lienzo = { ancho: ANCHO, alto: ALTO, margen: { arriba: 30, abajo: 10, izquierda: 200, derecha: 20 } };
  const geometria = calcularGeometriaPastel(datos, lienzo);
  const total = datos.reduce((acumulado, dato) => acumulado + dato.valor, 0);

  const porciones = geometria.porciones
    .filter((porcion) => porcion.valor > 0)
    .map((porcion) => {
      const color = COLORES_SEVERIDAD[porcion.etiqueta] ?? COLOR_BARRA_PRIMARIA;
      const inicio = puntoEnCirculo(geometria.centro, geometria.radio, porcion.anguloInicioGrados);
      const fin = puntoEnCirculo(geometria.centro, geometria.radio, porcion.anguloFinGrados);
      const arcoGrande = porcion.anguloFinGrados - porcion.anguloInicioGrados > 180 ? 1 : 0;
      return `<path d="M ${geometria.centro.x.toFixed(1)} ${geometria.centro.y.toFixed(1)} L ${inicio.x.toFixed(1)} ${inicio.y.toFixed(1)} A ${geometria.radio.toFixed(1)} ${geometria.radio.toFixed(1)} 0 ${arcoGrande} 1 ${fin.x.toFixed(1)} ${fin.y.toFixed(1)} Z" fill="${color}" stroke="#ffffff" />`;
    })
    .join('');

  const leyenda = datos
    .map((dato, indice) => {
      const color = COLORES_SEVERIDAD[dato.etiqueta] ?? COLOR_BARRA_PRIMARIA;
      const porcentaje = total === 0 ? 0 : (dato.valor / total) * 100;
      const y = 30 + indice * 16;
      return (
        `<rect x="8" y="${y - 8}" width="8" height="8" fill="${color}" />` +
        texto(20, y, `${dato.etiqueta}: ${dato.valor} (${porcentaje.toFixed(1)}%)`, { tamano: 7 })
      );
    })
    .join('');

  return envolverSvg(titulo(opciones.titulo) + porciones + leyenda);
}
