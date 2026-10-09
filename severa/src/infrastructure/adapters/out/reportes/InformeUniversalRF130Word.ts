import { Paragraph, HeadingLevel, TextRun, AlignmentType, ImageRun } from 'docx';
import { BloqueDeInforme, FragmentoDeTexto } from './BloquesDeInforme';
import { construirContenidoInforme } from './ContenidoInformeUniversalRF130';
import { ElementoDocumento, heading, texto, tabla, indice } from './LayoutInformeWord';
import type { ContextoInformeUniversal } from './InformeUniversalRF130';

// Renderer Word del informe de 20 secciones: traduce los bloques neutros de
// ContenidoInformeUniversalRF130.ts a objetos de la librería "docx". No
// decide contenido — qué dice cada sección vive en el archivo de contenido,
// compartido con HTML, LaTeX y Excel (ver BloquesDeInforme.ts).
//
// Hasta la Pasada 2-D este archivo ERA el contenido (las 20 funciones de
// sección devolvían Paragraph/Table directamente). La Pasada 3 las movió a
// ContenidoInformeUniversalRF130.ts sin cambiar una palabra; la traducción de
// cada bloque de acá abajo reproduce exactamente la construcción que usaba
// cada función. Verificado comparando word/document.xml, styles.xml e
// imágenes de 6 informes (4 genéricos, 2 CVSS) antes y después: idénticos
// byte a byte.

// Tamaños en "half-points", la unidad de docx: 24 = 12 pt, 18 = 9 pt.
const TAMANO_SUBTITULO_DE_PORTADA = 24;
const TAMANO_EPIGRAFE = 18;

function fragmentoARun(fragmento: FragmentoDeTexto): TextRun {
  if (!fragmento.negrita && !fragmento.cursiva) return new TextRun(fragmento.texto);
  return new TextRun({
    text: fragmento.texto,
    ...(fragmento.negrita ? { bold: true } : {}),
    ...(fragmento.cursiva ? { italics: true } : {})
  });
}

function bloqueAWord(bloque: BloqueDeInforme): ElementoDocumento[] {
  switch (bloque.tipo) {
    case 'titulo':
      return [new Paragraph({ text: bloque.texto, heading: HeadingLevel.TITLE })];
    case 'subtituloDePortada':
      return [new Paragraph({ children: [new TextRun({ text: bloque.texto, bold: true, size: TAMANO_SUBTITULO_DE_PORTADA })] })];
    case 'indice':
      return indice();
    case 'encabezado':
      return [heading(bloque.texto, bloque.nivel === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, bloque.saltoDePaginaAntes ?? false)];
    case 'parrafo':
      // Un párrafo de un solo fragmento sin formato es el caso común (texto()).
      return bloque.fragmentos.length === 1 && !bloque.fragmentos[0].negrita && !bloque.fragmentos[0].cursiva
        ? [texto(bloque.fragmentos[0].texto)]
        : [new Paragraph({ children: bloque.fragmentos.map(fragmentoARun) })];
    case 'vineta':
      return [new Paragraph({ text: bloque.texto, bullet: { level: 0 } })];
    case 'tabla':
      return [tabla(bloque.encabezados, bloque.filas)];
    case 'figura':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ type: 'png', data: bloque.png, transformation: { width: bloque.ancho, height: bloque.alto } })]
        })
      ];
    case 'epigrafe':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: bloque.texto, italics: true, size: TAMANO_EPIGRAFE })]
        })
      ];
    default: {
      const exhaustivo: never = bloque;
      throw new Error(`Bloque de informe no manejado: ${JSON.stringify(exhaustivo)}`);
    }
  }
}

export function renderizarBloquesWord(bloques: BloqueDeInforme[]): ElementoDocumento[] {
  return bloques.flatMap(bloqueAWord);
}

export async function construirContenidoWord(contexto: ContextoInformeUniversal): Promise<ElementoDocumento[]> {
  return renderizarBloquesWord(await construirContenidoInforme(contexto));
}
