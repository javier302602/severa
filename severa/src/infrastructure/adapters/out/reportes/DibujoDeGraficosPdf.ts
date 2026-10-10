import {
  calcularGeometriaBarras,
  calcularGeometriaBarrasHorizontales,
  calcularGeometriaBoxplot,
  calcularGeometriaDispersion,
  calcularGeometriaPastel,
  calcularGeometriaHeatmap,
  colorDivergenteCorrelacion,
  puntoEnCirculo,
  type DatoBarra,
  type ResumenCincoNumeros,
  type PuntoDispersion,
  type Lienzo,
  type MarcasDeEje,
  type AreaDeTrazado
} from '../../../../domain/services/graphs/GeometriaDeGraficos';
import type { MatrizCorrelacion } from '../../../../domain/services/descriptive-statistics/CorrelacionGenerico';

// Fase 1: dibuja los gráficos del informe con la API de dibujo vectorial de
// pdfkit (rect/moveTo-lineTo/path/circle) sobre la geometría YA calculada
// por GeometriaDeGraficos.ts (Fase 0c) — ninguna función de acá decide
// posiciones, solo las traduce a llamadas de dibujo. Sin SVG intermedio, sin
// librería de rasterizado nueva (decisión confirmada): es el mismo enfoque
// que ya usaba SvgGraficosAdapter.ts, aplicado a un lienzo de PDF en vez de
// a un string SVG.

const COLOR_TEXTO = '#1e293b';
const COLOR_TEXTO_SECUNDARIO = '#64748b';
const COLOR_EJE = '#334155';
const COLOR_BARRA_PRIMARIA = '#4682B4';
const COLOR_LINEA_MEDIA = '#dc2626';
const COLOR_LINEA_MEDIANA = '#16a34a';
// Por nivel de riesgo. Se conservan las claves con los nombres viejos para
// lo que todavía llegue con ellos.
const COLORES_SEVERIDAD: Record<string, string> = {
  Crítico: '#8B0000',
  Alto: '#ff8c00',
  Moderado: '#ffd700',
  Bajo: '#add8e6',
  Crítica: '#8B0000',
  Alta: '#ff8c00',
  Media: '#ffd700',
  Baja: '#add8e6'
};

const ALTO_GRAFICO_POR_DEFECTO = 220;

// Bug real (encontrado al exportar un gráfico suelto a PDF, RF-61, y
// confirmado en el informe ya publicado): GeometriaDeGraficos.ts devuelve
// coordenadas relativas al lienzo (x = 0 es el borde izquierdo del gráfico),
// pero acá se usaban como coordenadas absolutas de la página, mientras que
// títulos, leyendas y etiquetas de fila sí se colocaban en el margen
// izquierdo. Con el margen de 72 pt del formato APA, todo lo geométrico
// quedaba corrido 72 pt a la izquierda del texto: los gráficos invadían el
// margen y, en los Top 10 (barras horizontales), las barras tapaban por
// completo los nombres que debían leerse a su izquierda — los gráficos 9 y
// 10 del informe salían sin una sola etiqueta visible.
// origenX() es ese desplazamiento que faltaba; cada función lo suma a toda
// coordenada X que venga de la geometría.
//
// En vertical pasaba lo simétrico pero en sentido contrario: a cada Y de la
// geometría se le RESTABA el margen superior del lienzo (area.y), con lo que
// el área de trazado empezaba pegada al título, sin el aire que ese margen
// existe para dejar, y la etiqueta del eje Y caía encima del título. Ahora
// las Y del lienzo se usan tal cual, desplazadas solo por la posición del
// cursor (offsetY).
function origenX(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.left;
}

// Segundo efecto del mismo descuido: pdfkit deja el cursor horizontal (doc.x)
// donde se escribió el último texto, que en un gráfico es una etiqueta en
// cualquier parte del lienzo. El párrafo siguiente al gráfico arrancaba ahí,
// sangrado sin motivo. Cada función exportada termina devolviendo el cursor
// al margen.
function finalizar(doc: PDFKit.PDFDocument, yFinal: number): number {
  doc.x = doc.page.margins.left;
  return yFinal;
}
const ESPACIO_MINIMO_ETIQUETAS_BOXPLOT_PDF = 9;

function anchoDisponible(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function dibujarEjes(doc: PDFKit.PDFDocument, area: { x: number; y: number; ancho: number; alto: number }, y0: number): void {
  doc
    .strokeColor(COLOR_EJE)
    .lineWidth(1)
    .moveTo(area.x, y0)
    .lineTo(area.x, area.y + area.alto)
    .lineTo(area.x + area.ancho, area.y + area.alto)
    .stroke();
}

function dibujarTitulo(doc: PDFKit.PDFDocument, y: number, titulo: string): number {
  doc.fontSize(10).fillColor(COLOR_TEXTO).font('Helvetica-Bold').text(titulo, doc.page.margins.left, y);
  return y + 16;
}

function dibujarEtiquetasEjes(doc: PDFKit.PDFDocument, etiquetaEjeX: string | undefined, etiquetaEjeY: string | undefined, area: { x: number; y: number; ancho: number; alto: number }): void {
  doc.fontSize(7).fillColor(COLOR_TEXTO_SECUNDARIO).font('Helvetica');
  if (etiquetaEjeY) {
    // Sobre el extremo superior del eje, en una sola línea (igual que en la
    // versión SVG). Antes iba a la izquierda del eje en una columna de 40 pt:
    // "Días para parche" se partía en dos renglones y caía sobre la primera
    // marca numérica.
    doc.text(etiquetaEjeY, area.x - 6, area.y - 11, { lineBreak: false });
  }
  if (etiquetaEjeX) {
    doc.text(etiquetaEjeX, area.x, area.y + area.alto + 18, { width: area.ancho, align: 'center' });
  }
}

// Bug real reportado con capturas (mismo hallazgo que en SvgDibujoDeGraficos.ts,
// verificado también contra el informe descargable): ningún gráfico con eje
// numérico dibujaba marcas — solo la línea del eje, sin valores. `marcas`
// viene de calcularMarcasDeEje (GeometriaDeGraficos.ts); acá solo se traducen
// a trazos + texto de pdfkit.
function dibujarMarcasEjeVertical(doc: PDFKit.PDFDocument, marcas: MarcasDeEje, area: AreaDeTrazado): void {
  const rango = marcas.maximo - marcas.minimo || 1;
  doc.fontSize(6).fillColor(COLOR_TEXTO_SECUNDARIO).font('Helvetica');
  marcas.valores.forEach((valor) => {
    const y = area.y + area.alto - ((valor - marcas.minimo) / rango) * area.alto;
    doc.strokeColor(COLOR_EJE).lineWidth(1).moveTo(area.x - 3, y).lineTo(area.x, y).stroke();
    doc.text(formatearNumero(valor), area.x - 32, y - 3, { width: 28, align: 'right' });
  });
}

function dibujarMarcasEjeHorizontal(doc: PDFKit.PDFDocument, marcas: MarcasDeEje, area: AreaDeTrazado): void {
  const rango = marcas.maximo - marcas.minimo || 1;
  doc.fontSize(6).fillColor(COLOR_TEXTO_SECUNDARIO).font('Helvetica');
  marcas.valores.forEach((valor) => {
    const x = area.x + ((valor - marcas.minimo) / rango) * area.ancho;
    doc.strokeColor(COLOR_EJE).lineWidth(1).moveTo(x, area.y + area.alto).lineTo(x, area.y + area.alto + 3).stroke();
    doc.text(formatearNumero(valor), x - 14, area.y + area.alto + 5, { width: 28, align: 'center' });
  });
}

// Mismo bug real que en SvgDibujoDeGraficos.ts: valores con decimales de
// sobra (CVSS promedio por tipo de acceso) se imprimían tal cual venía
// calcularMedia() en vez de redondeados a algo legible.
function formatearNumero(valor: number): string {
  if (Number.isInteger(valor)) return String(valor);
  return String(Number(valor.toFixed(2)));
}

// pdfkit sí puede medir texto real (a diferencia del SVG, sin DOM/Canvas en
// el servidor) — se usa widthOfString en vez de un promedio aproximado.
function truncarTexto(doc: PDFKit.PDFDocument, valor: string, anchoMaximo: number): string {
  if (doc.widthOfString(valor) <= anchoMaximo) return valor;
  let recorte = valor;
  while (recorte.length > 1 && doc.widthOfString(`${recorte}…`) > anchoMaximo) {
    recorte = recorte.slice(0, -1);
  }
  return `${recorte}…`;
}

export interface OpcionesGrafico {
  titulo: string;
  etiquetaEjeX?: string;
  etiquetaEjeY?: string;
  alto?: number;
  colorBarra?: string;
  // Una línea al pie, dentro del gráfico (RF-28/RF-69: la escala de niveles).
  nota?: string;
}

// Escribe la nota al pie debajo de lo dibujado y devuelve dónde termina.
function dibujarNota(doc: PDFKit.PDFDocument, nota: string | undefined, y: number): number {
  if (!nota) return y;
  doc.fontSize(7).fillColor(COLOR_TEXTO_SECUNDARIO).font('Helvetica').text(nota, doc.page.margins.left, y, { width: anchoDisponible(doc) });
  return y + 12;
}

// Barras verticales — sirve tanto para gráficos de barras (severidad) como
// para histogramas (un bin es una barra más, mismo dibujo).
export function dibujarBarras(doc: PDFKit.PDFDocument, datos: DatoBarra[], opciones: OpcionesGrafico): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const alto = opciones.alto ?? ALTO_GRAFICO_POR_DEFECTO;
  const lienzo: Lienzo = { ancho: anchoDisponible(doc), alto, margen: { arriba: y0 - doc.y + 10, abajo: 40, izquierda: 55, derecha: 20 } };
  const { barras, area, marcasEje } = calcularGeometriaBarras(datos, lienzo);
  const yBase = doc.y + lienzo.alto;
  const offsetY = doc.y;
  const x0 = origenX(doc);

  barras.forEach((barra) => {
    doc
      .rect(x0 + barra.x, offsetY + barra.y, barra.ancho, barra.alto)
      .fillAndStroke(opciones.colorBarra ?? COLOR_BARRA_PRIMARIA, COLOR_EJE);
    doc
      .fontSize(6)
      .fillColor(COLOR_TEXTO)
      .font('Helvetica')
      .text(formatearNumero(barra.valor), x0 + barra.x, offsetY + barra.y - 9, { width: barra.ancho, align: 'center' });
    doc
      .fontSize(6)
      .fillColor(COLOR_TEXTO_SECUNDARIO)
      .text(barra.etiqueta, x0 + barra.x - 5, offsetY + area.y + area.alto + 4, { width: barra.ancho + 10, align: 'center' });
  });

  const areaAbsoluta = { x: x0 + area.x, y: offsetY + area.y, ancho: area.ancho, alto: area.alto };
  dibujarEjes(doc, areaAbsoluta, areaAbsoluta.y);
  dibujarMarcasEjeVertical(doc, marcasEje, areaAbsoluta);
  dibujarEtiquetasEjes(doc, opciones.etiquetaEjeX, opciones.etiquetaEjeY, areaAbsoluta);

  return finalizar(doc, dibujarNota(doc, opciones.nota, yBase + 30));
}

// Barras horizontales — Top N (tipos de vulnerabilidad, software). Antes no
// dibujaba ningún eje (ni la línea, mucho menos marcas numéricas) — mismo
// bug real que en SvgDibujoDeGraficos.ts, confirmado también en el informe
// descargable.
const MARGEN_ABAJO_BARRAS_HORIZONTALES_PDF = 26;
// Franja izquierda reservada para el nombre de cada barra, y el ancho que el
// texto puede ocupar dentro de ella (deja 15 pt de aire hasta el eje).
const MARGEN_IZQUIERDO_BARRAS_HORIZONTALES_PDF = 130;
const ANCHO_ETIQUETAS_BARRAS_HORIZONTALES_PDF = 115;

export function dibujarBarrasHorizontales(doc: PDFKit.PDFDocument, datos: DatoBarra[], opciones: OpcionesGrafico): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const alto = opciones.alto ?? Math.max(120, datos.length * 22) + MARGEN_ABAJO_BARRAS_HORIZONTALES_PDF;
  const lienzo: Lienzo = {
    ancho: anchoDisponible(doc),
    alto,
    margen: { arriba: y0 - doc.y + 10, abajo: MARGEN_ABAJO_BARRAS_HORIZONTALES_PDF, izquierda: MARGEN_IZQUIERDO_BARRAS_HORIZONTALES_PDF, derecha: 30 }
  };
  const { barras, area, marcasEje } = calcularGeometriaBarrasHorizontales(datos, lienzo);
  const offsetY = doc.y;
  const x0 = origenX(doc);

  barras.forEach((barra) => {
    // La etiqueta ocupa la franja izquierda del lienzo (su margen de 130),
    // alineada a la derecha contra el eje; la barra arranca donde termina.
    doc.fontSize(7).fillColor(COLOR_TEXTO).font('Helvetica');
    doc.text(truncarTexto(doc, barra.etiqueta, ANCHO_ETIQUETAS_BARRAS_HORIZONTALES_PDF), x0, offsetY + barra.y + barra.alto / 2 - 4, {
      width: ANCHO_ETIQUETAS_BARRAS_HORIZONTALES_PDF,
      align: 'right'
    });
    doc
      .rect(x0 + barra.x, offsetY + barra.y, barra.ancho, barra.alto)
      .fillAndStroke(opciones.colorBarra ?? COLOR_BARRA_PRIMARIA, COLOR_EJE);
    doc
      .fontSize(7)
      .fillColor(COLOR_TEXTO)
      .text(formatearNumero(barra.valor), x0 + barra.x + barra.ancho + 4, offsetY + barra.y + barra.alto / 2 - 4);
  });

  const areaAbsoluta = { x: x0 + area.x, y: offsetY + area.y, ancho: area.ancho, alto: area.alto };
  dibujarEjes(doc, areaAbsoluta, areaAbsoluta.y);
  dibujarMarcasEjeHorizontal(doc, marcasEje, areaAbsoluta);
  dibujarEtiquetasEjes(doc, opciones.etiquetaEjeX, undefined, areaAbsoluta);

  return finalizar(doc, dibujarNota(doc, opciones.nota, offsetY + lienzo.alto + 10));
}

export function dibujarHistograma(
  doc: PDFKit.PDFDocument,
  bins: Array<{ intervalo: string; frecuencia: number }>,
  media: number,
  mediana: number,
  opciones: OpcionesGrafico
): number {
  const yFinal = dibujarBarras(
    doc,
    bins.map((bin) => ({ etiqueta: bin.intervalo, valor: bin.frecuencia })),
    opciones
  );
  doc
    .fontSize(7)
    .fillColor(COLOR_LINEA_MEDIA)
    .text(`— Media = ${media.toFixed(2)}`, doc.page.margins.left, yFinal - 24, { continued: false });
  doc.fillColor(COLOR_LINEA_MEDIANA).text(`— Mediana = ${mediana.toFixed(2)}`, doc.page.margins.left, yFinal - 14);
  return finalizar(doc, yFinal);
}

export function dibujarBoxplot(doc: PDFKit.PDFDocument, resumen: ResumenCincoNumeros, opciones: OpcionesGrafico): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const alto = opciones.alto ?? ALTO_GRAFICO_POR_DEFECTO;
  const lienzo: Lienzo = { ancho: anchoDisponible(doc), alto, margen: { arriba: y0 - doc.y + 10, abajo: 30, izquierda: 55, derecha: 20 } };
  const offsetY = doc.y;
  dibujarUnBoxplot(doc, resumen, lienzo, origenX(doc), offsetY, opciones.etiquetaEjeY);
  return finalizar(doc, offsetY + lienzo.alto + 10);
}

// resumen: null (2026-07-19, bug real): un catálogo sin ninguna vulnerabilidad
// de un tipo de acceso (ej. todo Remoto, cero Local) ya no tiene un
// ResumenCincoNumeros para ese lado — en vez de romper el informe entero
// (ver RecopilarDatosDeInforme.resumenCincoNumerosSeguro), ese lado se
// dibuja como un aviso de texto en vez de un boxplot.
export function dibujarBoxplotDoble(
  doc: PDFKit.PDFDocument,
  grupoA: { etiqueta: string; resumen: ResumenCincoNumeros | null },
  grupoB: { etiqueta: string; resumen: ResumenCincoNumeros | null },
  opciones: OpcionesGrafico
): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const alto = opciones.alto ?? ALTO_GRAFICO_POR_DEFECTO;
  const anchoTotal = anchoDisponible(doc);
  const anchoMitad = anchoTotal / 2;
  const margen = { arriba: y0 - doc.y + 10, abajo: 30, izquierda: 55, derecha: 20 };
  const lienzo: Lienzo = { ancho: anchoMitad, alto, margen };
  const offsetY = doc.y;

  // offsetX ya es absoluto: margen de la página + mitad que le toca a cada grupo.
  const x0 = origenX(doc);
  dibujarLadoDeBoxplotOAviso(doc, grupoA.resumen, lienzo, x0, offsetY, opciones.etiquetaEjeY, grupoA.etiqueta);
  dibujarLadoDeBoxplotOAviso(doc, grupoB.resumen, lienzo, x0 + anchoMitad, offsetY, undefined, grupoB.etiqueta);

  return finalizar(doc, offsetY + lienzo.alto + 10);
}

function dibujarLadoDeBoxplotOAviso(
  doc: PDFKit.PDFDocument,
  resumen: ResumenCincoNumeros | null,
  lienzo: Lienzo,
  offsetX: number,
  offsetY: number,
  etiquetaEjeY: string | undefined,
  etiquetaGrupo: string
): void {
  if (resumen === null) {
    doc
      .fontSize(9)
      .fillColor(COLOR_TEXTO_SECUNDARIO)
      .text(`${etiquetaGrupo}: sin datos`, offsetX, offsetY + lienzo.alto / 2, { width: lienzo.ancho, align: 'center' });
    return;
  }
  dibujarUnBoxplot(doc, resumen, lienzo, offsetX, offsetY, etiquetaEjeY, etiquetaGrupo);
}

function dibujarUnBoxplot(
  doc: PDFKit.PDFDocument,
  resumen: ResumenCincoNumeros,
  lienzo: Lienzo,
  offsetX: number,
  offsetY: number,
  etiquetaEjeY: string | undefined,
  etiquetaGrupo?: string
): void {
  const geometria = calcularGeometriaBoxplot(resumen, lienzo);
  const t = (valor: { x: number; y: number }) => ({ x: valor.x + offsetX, y: valor.y + offsetY });

  const caja = { x: geometria.caja.x + offsetX, y: geometria.caja.y + offsetY, ancho: geometria.caja.ancho, alto: geometria.caja.alto };
  doc.lineWidth(1.5).rect(caja.x, caja.y, caja.ancho, caja.alto).fillAndStroke('#fca5a5', COLOR_EJE);

  const mediana1 = t({ x: geometria.lineaMediana.x1, y: geometria.lineaMediana.y1 });
  const mediana2 = t({ x: geometria.lineaMediana.x2, y: geometria.lineaMediana.y2 });
  doc.strokeColor(COLOR_EJE).lineWidth(2).moveTo(mediana1.x, mediana1.y).lineTo(mediana2.x, mediana2.y).stroke();

  // Bigotes: subidos de 1px a 2px (Fase 1, ajuste de legibilidad post-
  // verificación visual — 1px resultaba difícil de distinguir del fondo en
  // la imagen comprimida de la página al leer el PDF renderizado).
  const bigoteInf1 = t({ x: geometria.bigoteInferior.x1, y: geometria.bigoteInferior.y1 });
  const bigoteInf2 = t({ x: geometria.bigoteInferior.x2, y: geometria.bigoteInferior.y2 });
  doc.strokeColor(COLOR_EJE).lineWidth(2).moveTo(bigoteInf1.x, bigoteInf1.y).lineTo(bigoteInf2.x, bigoteInf2.y).stroke();

  const bigoteSup1 = t({ x: geometria.bigoteSuperior.x1, y: geometria.bigoteSuperior.y1 });
  const bigoteSup2 = t({ x: geometria.bigoteSuperior.x2, y: geometria.bigoteSuperior.y2 });
  doc.strokeColor(COLOR_EJE).lineWidth(2).moveTo(bigoteSup1.x, bigoteSup1.y).lineTo(bigoteSup2.x, bigoteSup2.y).stroke();

  const puntoMedia = t(geometria.puntoMedia);
  doc
    .strokeColor(COLOR_LINEA_MEDIA)
    .lineWidth(1.5)
    .moveTo(puntoMedia.x - 4, puntoMedia.y - 4)
    .lineTo(puntoMedia.x + 4, puntoMedia.y + 4)
    .moveTo(puntoMedia.x - 4, puntoMedia.y + 4)
    .lineTo(puntoMedia.x + 4, puntoMedia.y - 4)
    .stroke();

  const areaAbs = { x: geometria.area.x + offsetX, y: offsetY + geometria.area.y, ancho: geometria.area.ancho, alto: geometria.area.alto };
  dibujarEjes(doc, areaAbs, areaAbs.y);
  dibujarMarcasEjeVertical(doc, geometria.marcasEje, areaAbs);
  if (etiquetaEjeY) dibujarEtiquetasEjes(doc, undefined, etiquetaEjeY, areaAbs);

  // Bug real reportado con capturas: el boxplot no mostraba NINGÚN número —
  // ni siquiera el resumen de cinco números que la geometría ya calculaba.
  // Mismo criterio anti-solapamiento que la versión SVG: se omite una
  // etiqueta si queda a menos de ESPACIO_MINIMO_ETIQUETAS_BOXPLOT_PDF del
  // valor ya dibujado justo arriba.
  const xEtiqueta = caja.x + caja.ancho + 4;
  const candidatas = [
    { y: bigoteSup2.y, valor: resumen.maximo, color: COLOR_TEXTO },
    { y: caja.y, valor: resumen.q3, color: COLOR_TEXTO },
    { y: mediana1.y, valor: resumen.mediana, color: COLOR_TEXTO },
    { y: puntoMedia.y, valor: resumen.media, color: COLOR_LINEA_MEDIA },
    { y: caja.y + caja.alto, valor: resumen.q1, color: COLOR_TEXTO },
    { y: bigoteInf2.y, valor: resumen.minimo, color: COLOR_TEXTO }
  ].sort((a, b) => a.y - b.y);

  let ultimaY = -Infinity;
  candidatas.forEach((candidata) => {
    if (candidata.y - ultimaY < ESPACIO_MINIMO_ETIQUETAS_BOXPLOT_PDF) return;
    ultimaY = candidata.y;
    doc
      .fontSize(6)
      .fillColor(candidata.color)
      .font('Helvetica')
      .text(formatearNumero(candidata.valor), xEtiqueta, candidata.y - 3, { width: 28 });
  });

  if (etiquetaGrupo) {
    doc
      .fontSize(7)
      .fillColor(COLOR_TEXTO_SECUNDARIO)
      .font('Helvetica')
      .text(etiquetaGrupo, areaAbs.x, areaAbs.y + areaAbs.alto + 18, { width: areaAbs.ancho, align: 'center' });
  }
}

export function dibujarDispersion(
  doc: PDFKit.PDFDocument,
  puntos: PuntoDispersion[],
  correlacion: number,
  opciones: OpcionesGrafico
): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const alto = opciones.alto ?? ALTO_GRAFICO_POR_DEFECTO;
  const lienzo: Lienzo = { ancho: anchoDisponible(doc), alto, margen: { arriba: y0 - doc.y + 10, abajo: 30, izquierda: 55, derecha: 20 } };
  const offsetY = doc.y;
  const geometria = calcularGeometriaDispersion(puntos, lienzo);

  const x0 = origenX(doc);

  geometria.puntos.forEach((punto) => {
    doc
      .circle(x0 + punto.cx, offsetY + punto.cy, 2)
      .fillAndStroke(COLOR_BARRA_PRIMARIA, COLOR_BARRA_PRIMARIA);
  });

  if (geometria.lineaTendencia) {
    const { x1, y1, x2, y2 } = geometria.lineaTendencia;
    doc
      .strokeColor(COLOR_LINEA_MEDIA)
      .lineWidth(1.5)
      .moveTo(x0 + x1, offsetY + y1)
      .lineTo(x0 + x2, offsetY + y2)
      .stroke();
  }

  const areaAbs = { x: x0 + geometria.area.x, y: offsetY + geometria.area.y, ancho: geometria.area.ancho, alto: geometria.area.alto };
  dibujarEjes(doc, areaAbs, areaAbs.y);
  if (geometria.marcasEjeX && geometria.marcasEjeY) {
    dibujarMarcasEjeHorizontal(doc, geometria.marcasEjeX, areaAbs);
    dibujarMarcasEjeVertical(doc, geometria.marcasEjeY, areaAbs);
  }
  dibujarEtiquetasEjes(doc, opciones.etiquetaEjeX, opciones.etiquetaEjeY, areaAbs);

  const yFinal = offsetY + lienzo.alto;
  doc.fontSize(7).fillColor(COLOR_TEXTO_SECUNDARIO).font('Helvetica').text(`Correlación de Pearson = ${correlacion.toFixed(3)}`, doc.page.margins.left, yFinal + 22);

  return finalizar(doc, yFinal + 34);
}

// Mejora 4 (Análisis de Datos General) — Fase 5. Heatmap de la matriz de
// correlación: escala divergente azul (-1) — blanco (0) — rojo (+1), mismo
// criterio de "color con significado" que COLORES_SEVERIDAD más abajo. La
// escala en sí (colorDivergenteCorrelacion) vive en GeometriaDeGraficos.ts
// desde que el renderer SVG también la necesita (informe Word genérico).
const ANCHO_ETIQUETAS_HEATMAP = 75;
const ALTO_ETIQUETAS_DE_COLUMNA_HEATMAP = 12;
const LARGO_MAXIMO_ETIQUETA_HEATMAP = 11;

export function dibujarHeatmap(doc: PDFKit.PDFDocument, matriz: MatrizCorrelacion, opciones: OpcionesGrafico): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const n = matriz.columnas.length;

  if (n === 0) {
    doc.fontSize(8).fillColor(COLOR_TEXTO_SECUNDARIO).font('Helvetica').text('No hay columnas numéricas elegibles para el heatmap.', doc.page.margins.left, y0);
    return finalizar(doc, y0 + 20);
  }

  const alto = opciones.alto ?? Math.min(320, Math.max(150, n * 32));
  const anchoGrilla = Math.min(anchoDisponible(doc) - ANCHO_ETIQUETAS_HEATMAP, alto);
  const lienzo: Lienzo = { ancho: anchoGrilla, alto, margen: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } };
  // La grilla empieza un renglón más abajo del título: ese renglón es para
  // los nombres de columna, que se escriben justo encima de la grilla. Sin
  // este espacio caían sobre el propio título y quedaban tapados por él.
  const offsetY = doc.y + ALTO_ETIQUETAS_DE_COLUMNA_HEATMAP;
  const offsetX = doc.page.margins.left + ANCHO_ETIQUETAS_HEATMAP;

  const valores = matriz.filas.map((fila) => fila.correlaciones.map((celda) => celda.valor));
  const geometria = calcularGeometriaHeatmap(valores, lienzo);

  geometria.celdas.forEach((celda) => {
    const x = offsetX + celda.x;
    const y = offsetY + celda.y;
    const color = celda.valor === null ? '#e2e8f0' : colorDivergenteCorrelacion(celda.valor);
    doc.rect(x, y, celda.ancho, celda.alto).fillAndStroke(color, '#ffffff');
    doc
      .fontSize(Math.max(5, Math.min(7, celda.ancho / 5)))
      .fillColor(celda.valor !== null && Math.abs(celda.valor) > 0.6 ? '#ffffff' : COLOR_TEXTO)
      .font('Helvetica')
      .text(celda.valor === null ? 'N/D' : celda.valor.toFixed(2), x, y + celda.alto / 2 - 4, { width: celda.ancho, align: 'center' });
  });

  // Etiquetas de columna (arriba de la grilla) y de fila (a la izquierda) —
  // en horizontal: pdfkit no rota texto sin manipular la matriz de
  // transformación a mano, y para la cantidad de columnas esperable en un
  // dataset genérico (unas pocas a una decena) el nombre truncado en
  // horizontal es más legible que texto vertical apretado.
  matriz.columnas.forEach((nombre, indice) => {
    doc
      .fontSize(6)
      .fillColor(COLOR_TEXTO_SECUNDARIO)
      .font('Helvetica')
      .text(nombre.slice(0, LARGO_MAXIMO_ETIQUETA_HEATMAP), offsetX + indice * geometria.tamanoCelda, offsetY - 10, {
        width: geometria.tamanoCelda,
        align: 'center'
      });
    doc
      .fontSize(6)
      .fillColor(COLOR_TEXTO_SECUNDARIO)
      .font('Helvetica')
      .text(
        nombre.slice(0, LARGO_MAXIMO_ETIQUETA_HEATMAP),
        doc.page.margins.left,
        offsetY + indice * geometria.tamanoCelda + geometria.tamanoCelda / 2 - 3,
        { width: ANCHO_ETIQUETAS_HEATMAP - 6, align: 'right' }
      );
  });

  return finalizar(doc, offsetY + geometria.area.alto + 20);
}

export function dibujarPastel(doc: PDFKit.PDFDocument, datos: DatoBarra[], opciones: OpcionesGrafico): number {
  const y0 = dibujarTitulo(doc, doc.y, opciones.titulo);
  const alto = opciones.alto ?? ALTO_GRAFICO_POR_DEFECTO;
  const lienzo: Lienzo = { ancho: anchoDisponible(doc), alto, margen: { arriba: y0 - doc.y + 10, abajo: 10, izquierda: 200, derecha: 20 } };
  const offsetY = doc.y;
  const geometria = calcularGeometriaPastel(datos, lienzo);
  const centro = { x: origenX(doc) + geometria.centro.x, y: offsetY + geometria.centro.y };

  geometria.porciones.forEach((porcion) => {
    const color = COLORES_SEVERIDAD[porcion.etiqueta] ?? COLOR_BARRA_PRIMARIA;
    const inicio = puntoEnCirculo(centro, geometria.radio, porcion.anguloInicioGrados);
    const fin = puntoEnCirculo(centro, geometria.radio, porcion.anguloFinGrados);
    const grandeArco = porcion.anguloFinGrados - porcion.anguloInicioGrados > 180 ? 1 : 0;

    doc
      .path(`M ${centro.x} ${centro.y} L ${inicio.x} ${inicio.y} A ${geometria.radio} ${geometria.radio} 0 ${grandeArco} 1 ${fin.x} ${fin.y} Z`)
      .fillAndStroke(color, '#ffffff');
  });

  let yLeyenda = offsetY;
  datos.forEach((dato) => {
    const color = COLORES_SEVERIDAD[dato.etiqueta] ?? COLOR_BARRA_PRIMARIA;
    doc.rect(doc.page.margins.left, yLeyenda, 8, 8).fill(color);
    const total = datos.reduce((acum, item) => acum + item.valor, 0);
    const porcentaje = total === 0 ? 0 : (dato.valor / total) * 100;
    doc
      .fontSize(7)
      .fillColor(COLOR_TEXTO)
      .font('Helvetica')
      .text(`${dato.etiqueta}: ${dato.valor} (${porcentaje.toFixed(1)}%)`, doc.page.margins.left + 12, yLeyenda - 1);
    yLeyenda += 14;
  });

  return finalizar(doc, dibujarNota(doc, opciones.nota, offsetY + lienzo.alto + 10));
}
