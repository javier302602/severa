// M-10 Ronda 2, Pasada 2-A (RF-130): extracción PURA desde GeneradorInformePDF.ts
// — mismo código, mismo comportamiento, sin ningún cambio de lógica. Se
// separa acá porque InformeUniversalRF130.ts (el orquestador nuevo de 20
// secciones, todavía sin conectar a nada) necesita estos mismos primitivos
// de layout, y antes de esta extracción eran privados del archivo viejo. La
// prueba de que esto no cambió nada es que GeneradorInformePDF.test.ts no
// necesita ni un solo cambio después de este archivo.

// ---------------------------------------------------------------------
// Índice (tabla de contenidos): cada llamada a nuevaSeccion() es un capítulo
// numerado, y se registra acá con la página real donde cayó — no hay forma
// de saber de antemano en qué página termina el capítulo anterior sin
// contar párrafos a mano, así que se usa bufferPages (ver quien orquesta el
// documento) para volver a la página del índice al final, una vez que la
// paginación completa ya se conoce.
//
// El array de entradas se guarda en una propiedad puesta directamente sobre
// LA INSTANCIA de PDFDocument de esta generación (no en una variable de
// módulo): dos informes generándose en paralelo (dos requests concurrentes)
// tienen cada uno su propio `doc`, así que no hay estado compartido entre
// ellos — dos analistas pidiendo un informe al mismo tiempo no se pisan.
export interface EntradaIndice {
  numero: string;
  titulo: string;
  pagina: number;
}

export interface DocConIndice extends PDFKit.PDFDocument {
  _entradasIndice?: EntradaIndice[];
}

export function nuevaSeccion(doc: PDFKit.PDFDocument, numero: string, titulo: string): void {
  if (doc.y > doc.page.margins.top) {
    doc.addPage();
  }
  (doc as DocConIndice)._entradasIndice?.push({ numero, titulo, pagina: doc.bufferedPageRange().count });
  doc.fontSize(15).fillColor('#0f172a').font('Times-Bold').text(`${numero}. ${titulo}`, { underline: true });
  doc.moveDown(0.5);
}

// Se llama justo después de dibujar la portada: agrega una página en blanco
// que se reserva para el índice (se completa recién en completarIndice, una
// vez conocida la paginación real de todo el documento) y, a continuación,
// una segunda página nueva donde arranca el capítulo 1 — sin este segundo
// addPage(), nuevaSeccion() vería doc.y ya en el margen superior de la
// página recién creada y NO abriría una página nueva propia, así que el
// capítulo 1 terminaría escribiéndose encima de la página reservada para el
// índice en vez de después de ella.
export function reservarPaginaDeIndice(doc: PDFKit.PDFDocument): number {
  (doc as DocConIndice)._entradasIndice = [];
  doc.addPage();
  const numeroDePagina = doc.bufferedPageRange().count - 1;
  doc.addPage();
  return numeroDePagina;
}

// Vuelve a la página reservada por reservarPaginaDeIndice() y dibuja el
// título + una línea por capítulo con su página real, ya conocida a esta
// altura porque todo el contenido del documento ya se generó. pdfkit no
// resetea x/y al cambiar de página con switchToPage — se fijan a mano al
// margen superior, si no se seguiría escribiendo desde donde haya quedado
// la última página real del documento.
export function completarIndice(doc: PDFKit.PDFDocument, numeroDePagina: number): void {
  const entradas = (doc as DocConIndice)._entradasIndice ?? [];
  const ultimaPagina = doc.bufferedPageRange().count - 1;

  doc.switchToPage(numeroDePagina);
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;

  doc.fontSize(18).fillColor('#0f172a').font('Times-Bold').text('Índice', { align: 'center' });
  doc.moveDown(1.5);

  // Título a la izquierda y página a la derecha, en la misma línea, con dos
  // llamadas independientes que fijan cada una su posición. No se encadenan
  // con `continued` (se probó contra un PDF real y pdfkit no conserva bien
  // ese estado entre llamadas: el número de página terminaba en otra línea),
  // ni se arma un único texto relleno con espacios (la variante anterior):
  // el ancho del relleno se calculaba a mano y por un error de redondeo
  // algunas entradas se pasaban del ancho y el número caía a la línea de
  // abajo.
  const anchoDisponible = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fontSize(11).font('Times-Roman').fillColor('#334155');
  entradas.forEach((entrada) => {
    const y = doc.y;
    doc.text(`${entrada.numero}. ${entrada.titulo}`, doc.page.margins.left, y, { lineBreak: false });
    doc.text(`pág. ${entrada.pagina}`, doc.page.margins.left, y, { width: anchoDisponible, align: 'right', lineBreak: false });
    doc.x = doc.page.margins.left;
    doc.y = y;
    // La línea recién escrita más 1,1 de separación: el mismo interlineado
    // que tenía el índice.
    doc.moveDown(2.1);
  });

  doc.switchToPage(ultimaPagina);
}

// Numeración continua (APA 7): un número por página, arriba a la derecha,
// sobre TODO el documento (incluida la portada) — llamada al final, una vez
// que ya no queda ningún otro switchToPage pendiente (completarIndice ya
// dejó al doc posicionado en la última página real antes de esto).
export function numerarPaginas(doc: PDFKit.PDFDocument): void {
  const rango = doc.bufferedPageRange();
  for (let indice = rango.start; indice < rango.start + rango.count; indice++) {
    doc.switchToPage(indice);
    const numero = indice - rango.start + 1;
    doc
      .fontSize(10)
      .font('Times-Roman')
      .fillColor('#334155')
      .text(String(numero), doc.page.width - doc.page.margins.right - 40, doc.page.margins.top / 2, {
        width: 40,
        align: 'right',
        lineBreak: false
      });
  }
}

export function subseccion(doc: PDFKit.PDFDocument, titulo: string): void {
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#1e293b').font('Times-Bold').text(titulo);
  doc.moveDown(0.2);
}

export function parrafo(doc: PDFKit.PDFDocument, texto: string): void {
  doc.fontSize(9.5).fillColor('#334155').font('Times-Roman').text(texto, { align: 'justify' });
  doc.moveDown(0.4);
}

export function formula(doc: PDFKit.PDFDocument, texto: string): void {
  doc.fontSize(9).fillColor('#0f172a').font('Times-Italic').text(texto);
  doc.moveDown(0.3);
}

export function asegurarEspacio(doc: PDFKit.PDFDocument, alturaNecesaria: number): void {
  const espacioRestante = doc.page.height - doc.page.margins.bottom - doc.y;
  if (espacioRestante < alturaNecesaria) {
    doc.addPage();
  }
}

// Alto mínimo de una fila (el de una sola línea de texto a 8 pt) y relleno
// horizontal/vertical de cada celda.
const ALTURA_MINIMA_DE_FILA = 16;
const RELLENO_DE_CELDA = 4;

// Alto que necesita una fila para que entre su celda más alta. Antes todas
// las filas medían 16 pt fijos: una celda cuyo texto no entraba en una línea
// (un nombre de columna largo, una descripción) seguía escribiendo sobre la
// fila de abajo. Con una sola línea por celda el resultado es el mismo alto
// de siempre.
function alturaDeFila(doc: PDFKit.PDFDocument, celdas: string[], anchos: number[]): number {
  const alturaDeTexto = celdas.reduce(
    (mayor, celda, indice) => Math.max(mayor, doc.heightOfString(celda, { width: anchos[indice] - 2 * RELLENO_DE_CELDA })),
    0
  );
  return Math.max(ALTURA_MINIMA_DE_FILA, Math.ceil(alturaDeTexto) + 6);
}

export function dibujarTabla(doc: PDFKit.PDFDocument, encabezados: string[], filas: string[][], anchosColumna?: number[]): void {
  const anchoTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchos = anchosColumna ?? encabezados.map(() => anchoTotal / encabezados.length);

  doc.fontSize(8).font('Times-Bold');
  const alturaEncabezado = alturaDeFila(doc, encabezados, anchos);
  // El encabezado no se dibuja solo al pie de una página: se pide lugar para
  // él y para una fila más.
  asegurarEspacio(doc, alturaEncabezado + ALTURA_MINIMA_DE_FILA);
  let x = doc.page.margins.left;
  const yEncabezado = doc.y;
  doc.fillColor('#ffffff');
  doc.rect(doc.page.margins.left, yEncabezado, anchoTotal, alturaEncabezado).fill('#334155');
  encabezados.forEach((encabezado, indice) => {
    doc.fillColor('#ffffff').text(encabezado, x + RELLENO_DE_CELDA, yEncabezado + RELLENO_DE_CELDA, { width: anchos[indice] - 2 * RELLENO_DE_CELDA });
    x += anchos[indice];
  });
  doc.y = yEncabezado + alturaEncabezado;

  filas.forEach((fila, indiceFila) => {
    doc.fontSize(8).font('Times-Roman');
    const altura = alturaDeFila(doc, fila, anchos);
    asegurarEspacio(doc, altura);
    const y = doc.y;
    if (indiceFila % 2 === 1) {
      doc.rect(doc.page.margins.left, y, anchoTotal, altura).fill('#f1f5f9');
    }
    x = doc.page.margins.left;
    doc.fontSize(8).font('Times-Roman').fillColor('#1e293b');
    fila.forEach((celda, indiceColumna) => {
      doc.text(celda, x + RELLENO_DE_CELDA, y + RELLENO_DE_CELDA, { width: anchos[indiceColumna] - 2 * RELLENO_DE_CELDA });
      x += anchos[indiceColumna];
    });
    doc.y = y + altura;
  });

  // pdfkit recuerda la x de la última celda dibujada: sin esto, el párrafo o
  // el subtítulo que viniera después de una tabla se escribía dentro del
  // ancho de la última columna (un texto de una página de ancho quedaba como
  // una tira angosta contra el margen derecho).
  doc.x = doc.page.margins.left;
  doc.moveDown(0.6);
}

// Extraído del cuerpo de dibujarEtiquetaTipoAnalisis (GeneradorInformePDF.ts,
// Pasada 1) — mismo dibujo exacto (rect redondeado + texto claro encima),
// ahora parametrizado por color en vez de derivarlo de TipoDeAnalisis, para
// que InformeUniversalRF130.ts pueda reusarlo con su propia paleta (badge de
// sección "No aplicable", eje conceptual distinto de TipoDeAnalisis — ver
// InformeUniversalRF130.ts) sin duplicar el dibujo.
export function dibujarBadge(doc: PDFKit.PDFDocument, texto: string, color: string): void {
  doc.fontSize(7.5).font('Times-Bold');
  const anchoTexto = doc.widthOfString(texto);
  const relleno = 6;
  const alto = 14;
  const x = doc.page.margins.left;
  const y = doc.y;

  doc.roundedRect(x, y, anchoTexto + relleno * 2, alto, 3).fill(color);
  doc.fillColor('#ffffff').text(texto, x + relleno, y + 3, { lineBreak: false });

  doc.x = doc.page.margins.left;
  doc.y = y + alto + 4;
}
