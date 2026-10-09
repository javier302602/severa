// M-10 Ronda 2, Pasada 3 (RF-79/RF-80/RF-132/RF-133): el contenido del
// informe de 20 secciones, descrito sin atarlo a ningún formato de salida.
//
// Hasta la Pasada 2-D cada formato armaba su propio documento: el PDF
// dibujando sobre pdfkit (InformeUniversalRF130.ts) y el Word devolviendo
// objetos de la librería "docx". Las 20 secciones estaban escritas dos veces,
// y agregar HTML y LaTeX de la misma manera las habría dejado escritas cuatro
// — cuatro lugares donde corregir una oración, y la garantía de que tarde o
// temprano dos formatos del mismo informe dirían cosas distintas (ya pasó:
// la tabla de valores atípicos se perdió en uno solo de los dos).
//
// Un informe es una lista plana de estos bloques, en orden de lectura.
// ContenidoInformeUniversalRF130.ts la arma UNA vez por pipeline; cada
// formato nuevo es un renderer de bloques, sin contenido propio:
//   - Word  -> InformeUniversalRF130Word.ts
//   - HTML  -> RenderizadorInformeHtml.ts
//   - LaTeX -> RenderizadorInformeLatex.ts
//   - Excel -> ExportadorTablasDeInformeExcel.ts (solo los bloques 'tabla')
// El PDF sigue con su renderer propio sobre pdfkit: reescribirlo sobre
// bloques es posible, pero implica reabrir un archivo ya cerrado y revisado
// (decisión de la Pasada 2-D), y ninguno de los formatos nuevos lo necesita.
//
// El modelo es deliberadamente chico: solo lo que el informe usa hoy. No hay
// listas anidadas, ni celdas combinadas, ni estilos libres — un bloque nuevo
// obliga a resolverlo en todos los renderers, así que se agrega cuando hace
// falta, no por si acaso.

export interface FragmentoDeTexto {
  texto: string;
  negrita?: boolean;
  cursiva?: boolean;
}

export type BloqueDeInforme =
  // Título del documento (portada). Uno solo, al principio.
  | { tipo: 'titulo'; texto: string }
  // Línea destacada bajo el título ("Generado por SIADE para ...").
  | { tipo: 'subtituloDePortada'; texto: string }
  // Lugar donde va el índice. Cada renderer lo resuelve a su manera: campo
  // TOC en Word, lista de enlaces en HTML, \tableofcontents en LaTeX.
  | { tipo: 'indice' }
  // nivel 1: una de las 20 secciones de RF-130 (entra al índice).
  // nivel 2: subsección dentro de ella.
  | { tipo: 'encabezado'; nivel: 1 | 2; texto: string; saltoDePaginaAntes?: boolean }
  | { tipo: 'parrafo'; fragmentos: FragmentoDeTexto[] }
  | { tipo: 'vineta'; texto: string }
  | { tipo: 'tabla'; encabezados: string[]; filas: string[][] }
  // Una figura ya dibujada, en los dos formatos que los renderers necesitan:
  // svg (vectorial, para HTML) y png (para Word, LaTeX y la descarga suelta).
  // ancho/alto: tamaño de colocación en unidades del viewBox del SVG.
  | { tipo: 'figura'; titulo: string; svg: string; png: Buffer; ancho: number; alto: number }
  // Pie de la figura inmediatamente anterior.
  | { tipo: 'epigrafe'; texto: string };

export type BloqueTabla = Extract<BloqueDeInforme, { tipo: 'tabla' }>;
export type BloqueFigura = Extract<BloqueDeInforme, { tipo: 'figura' }>;

export function titulo(texto: string): BloqueDeInforme {
  return { tipo: 'titulo', texto };
}

export function subtituloDePortada(texto: string): BloqueDeInforme {
  return { tipo: 'subtituloDePortada', texto };
}

export function indice(): BloqueDeInforme {
  return { tipo: 'indice' };
}

export function encabezado(texto: string, saltoDePaginaAntes = false): BloqueDeInforme {
  return { tipo: 'encabezado', nivel: 1, texto, saltoDePaginaAntes };
}

export function subtitulo(texto: string): BloqueDeInforme {
  return { tipo: 'encabezado', nivel: 2, texto };
}

export function texto(contenido: string): BloqueDeInforme {
  return { tipo: 'parrafo', fragmentos: [{ texto: contenido }] };
}

// "Etiqueta: valor", con la etiqueta en negrita — el patrón que el informe
// usa para "Tipo: Descriptivo", "Estado: No aplicable" y los bloques de cada
// gráfico ("Objetivo del gráfico: ...").
export function etiquetado(etiqueta: string, valor: string): BloqueDeInforme {
  return { tipo: 'parrafo', fragmentos: [{ texto: etiqueta, negrita: true }, { texto: valor }] };
}

export function vineta(contenido: string): BloqueDeInforme {
  return { tipo: 'vineta', texto: contenido };
}

export function tabla(encabezados: string[], filas: string[][]): BloqueDeInforme {
  return { tipo: 'tabla', encabezados, filas };
}

export function figura(datos: Omit<BloqueFigura, 'tipo'>): BloqueDeInforme {
  return { tipo: 'figura', ...datos };
}

export function epigrafe(contenido: string): BloqueDeInforme {
  return { tipo: 'epigrafe', texto: contenido };
}

// Texto plano de un párrafo, sin formato — para los renderers y
// exportadores que no distinguen negrita (títulos de hoja de Excel, texto
// alternativo de una figura).
export function textoPlano(fragmentos: FragmentoDeTexto[]): string {
  return fragmentos.map((fragmento) => fragmento.texto).join('');
}
