import { Paragraph, Table, TableRow, TableCell, TextRun, WidthType, TableOfContents, HeadingLevel, AlignmentType } from 'docx';

// M-10 Ronda 2, Pasada 2-D (RF-130), Paso 1: extracción PURA desde
// GeneradorInformeWord.ts — mismo código, mismo comportamiento, sin ningún
// cambio de lógica. Se separa acá porque InformeUniversalRF130Word.ts (el
// orquestador nuevo de 20 secciones para el pipeline CVSS, análogo a
// LayoutInformePdf.ts/InformeUniversalRF130.ts del lado PDF) necesita estos
// mismos primitivos, y antes de esta extracción eran privados de
// GeneradorInformeWord.ts. La prueba de que esto no cambió nada es que
// GeneradorInformeWord.test.ts no necesita ni un solo cambio después de este
// archivo. heading() se exporta también (a diferencia de antes, que era
// privada) para que los tests puedan espiarla vía jest.mock — mismo
// mecanismo que ya usa InformeUniversalRF130.test.ts sobre nuevaSeccion() del
// lado PDF.

// TableOfContents (ver indice() más abajo) es un FileChild como Paragraph y
// Table, pero no un subtipo de ninguno de los dos — se necesita esta unión
// para que las listas de contenido de la sección puedan incluir los tres.
export type ElementoDocumento = Paragraph | Table | TableOfContents;

// Formato APA 7 (2026-07-20): fuente Times New Roman 12pt (24 en
// "half-points", la unidad que usa docx) para el cuerpo, interlineado 1.5
// (line: 360 = 1.5 × 240, donde 240 es "un renglón" en docx) y un espacio
// después de cada párrafo. Los márgenes de 1 pulgada van en `sections.properties.page.margin`
// de cada Document (1440 twips = 1 pulgada), no acá.
export const ESTILOS_APA7 = {
  default: {
    document: {
      run: { font: 'Times New Roman', size: 24 },
      paragraph: { spacing: { line: 360, after: 200 } }
    }
  }
};

export const MARGEN_APA7_TWIPS = 1440; // 1 pulgada = 1440 twips (unidad de docx)

// Bug real reportado: las tablas no tenían bordes visibles. BORDE_CELDA se
// aplica a las 4 caras de cada celda (docx no hereda un borde "de tabla" a
// las celdas si no se lo pasa explícito a cada una).
const BORDE_CELDA = { style: 'single' as const, size: 4, color: '94A3B8' };
const BORDES_DE_CELDA = { top: BORDE_CELDA, bottom: BORDE_CELDA, left: BORDE_CELDA, right: BORDE_CELDA };

export function celda(texto: string, encabezado = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: texto, bold: encabezado })] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_DE_CELDA,
    shading: encabezado ? { fill: 'E2E8F0' } : undefined
  });
}

export function tabla(encabezados: string[], filas: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: encabezados.map((texto) => celda(texto, true)) }),
      ...filas.map((fila) => new TableRow({ children: fila.map((texto) => celda(texto)) }))
    ]
  });
}

export function heading(texto: string, nivel: (typeof HeadingLevel)[keyof typeof HeadingLevel], saltoDePaginaAntes = false): Paragraph {
  return new Paragraph({ text: texto, heading: nivel, pageBreakBefore: saltoDePaginaAntes });
}

export function texto(contenido: string): Paragraph {
  return new Paragraph({ text: contenido });
}

// Índice: a diferencia del PDF (que puede calcular la página real de cada
// capítulo con bufferPages, ver GeneradorInformePDF.ts), .docx no tiene forma
// de saber en qué página cae un heading hasta que Word abre el archivo y
// compone el layout con sus propias fuentes/tamaño de papel — por eso esto
// es un CAMPO (field code), no texto ya calculado: Word lo rellena solo al
// abrir el documento (o al presionar F9/"Actualizar campo" si ya estaba
// abierto). headingStyleRange '1-1' limita el índice a los headings de nivel
// 1 (los capítulos numerados), igual que el índice del PDF, que tampoco
// lista subsecciones.
export function indice(): ElementoDocumento[] {
  return [
    new Paragraph({ text: 'Índice', heading: HeadingLevel.HEADING_1 }),
    new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-1' })
  ];
}
