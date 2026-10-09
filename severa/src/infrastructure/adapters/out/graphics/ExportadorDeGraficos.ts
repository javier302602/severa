import PDFDocument from 'pdfkit';
import sharp from 'sharp';

// RF-61: descarga de un gráfico suelto en PNG o PDF "de alta resolución (300
// dpi)", para pegarlo en una presentación o un documento.

export const DPI_DE_EXPORTACION = 300;

// El SVG se rasteriza directamente a 300 dpi (no se agranda un PNG chico): el
// texto y las líneas salen nítidos a ese tamaño. Además se graba la densidad
// en el propio archivo (bloque pHYs): un programa que respeta ese dato lo
// coloca a su tamaño físico real (~16 cm de ancho) en vez de a "1917 píxeles".
export async function exportarGraficoComoPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: DPI_DE_EXPORTACION }).png().withMetadata({ density: DPI_DE_EXPORTACION }).toBuffer();
}

// Recibe el documento con el cursor en el margen superior, dibuja el gráfico
// y devuelve la coordenada Y donde terminó (lo que ya hacen todas las
// funciones de DibujoDeGraficosPdf.ts).
export type DibujoEnPdf = (doc: PDFKit.PDFDocument) => number;

const ANCHO_PAGINA_PDF = 520;
const MARGEN_PDF = 28;
const ALTO_PAGINA_DE_MEDICION = 2000;

function renderizarPdf(altoPagina: number, dibujar: DibujoEnPdf): Promise<{ buffer: Buffer; yFinal: number }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [ANCHO_PAGINA_PDF, altoPagina], margin: MARGEN_PDF });
    const partes: Buffer[] = [];
    let yFinal = 0;
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve({ buffer: Buffer.concat(partes), yFinal }));
    doc.on('error', reject);
    try {
      yFinal = dibujar(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// PDF vectorial de una sola página, del tamaño justo del gráfico. El alto de
// cada tipo de gráfico depende de sus datos (un Top 10 es más alto que un
// boxplot), y pdfkit no permite recortar una página ya creada: se dibuja una
// vez sobre una página larga solo para medir dónde termina, y otra sobre la
// página definitiva. Dibujar dos veces un gráfico es instantáneo.
export async function exportarGraficoComoPdf(dibujar: DibujoEnPdf): Promise<Buffer> {
  const { yFinal } = await renderizarPdf(ALTO_PAGINA_DE_MEDICION, dibujar);
  const alto = Math.min(ALTO_PAGINA_DE_MEDICION, Math.max(120, Math.ceil(yFinal) + MARGEN_PDF));
  return (await renderizarPdf(alto, dibujar)).buffer;
}
