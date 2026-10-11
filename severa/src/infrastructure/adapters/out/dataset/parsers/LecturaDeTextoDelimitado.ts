import fs from 'fs';
import { Transform } from 'stream';
import { parse } from 'csv-parse/sync';
import { parse as parseEnStreaming } from 'csv-parse';

// Lectura de archivos de texto delimitado (.csv, .tsv) sin dejar que ninguna
// librería adivine. La usan los dos lectores —el del camino genérico
// (LectorDatasetGenerico) y el del catálogo (LectorExcelDataset, también por
// streaming)— para que un mismo archivo se lea igual en los dos lados.
//
// Antes los CSV pasaban por XLSX.readFile (SheetJS), con dos defectos reales:
//   1. un CSV en UTF-8 sin BOM se leía como latin-1 ("Huánuco" → "HuÃ¡nuco"),
//      también en los nombres de columna;
//   2. un CSV de Excel en español (punto y coma, coma decimal) convertía
//      "25,5" en 255 sin ningún error: corrompía en silencio las estadísticas.
//
// Acá se decide todo de forma explícita:
//   - codificación: BOM si lo hay; si no, UTF-8 estricto; si los bytes no son
//     UTF-8 válido, Windows-1252 (el "ANSI" de Excel en Windows);
//   - separador: coma, punto y coma, tabulación o barra, el que reparte las
//     primeras líneas en la misma cantidad de campos, respetando comillas;
//   - celdas: siempre como texto; los números los convierte una regla propia
//     POR COLUMNA, que acepta coma o punto decimal y separadores de miles en
//     las dos convenciones, y que nunca cambia una magnitud en silencio: si una
//     columna se puede leer de dos formas que dan números distintos (todos sus
//     valores son del tipo "1,234"), queda como texto y se avisa.

export type Codificacion = 'UTF-8 con BOM' | 'UTF-8' | 'Windows-1252' | 'UTF-16 con BOM';
export type Separador = ',' | ';' | '\t' | '|';
export type ConvencionDecimal = 'punto decimal' | 'coma decimal' | 'mixta' | 'sin decimales';

export interface InformacionDeLectura {
  codificacion: Codificacion;
  separador: Separador;
  convencionDecimal: ConvencionDecimal;
  // Columnas que no se convirtieron a número por ambiguas, con el motivo.
  avisos: string[];
}

export const NOMBRE_DE_SEPARADOR: Record<Separador, string> = {
  ',': 'coma',
  ';': 'punto y coma',
  '\t': 'tabulación',
  '|': 'barra vertical'
};

// --- Codificación -------------------------------------------------------------

export function decodificar(bytes: Buffer): { texto: string; codificacion: Codificacion } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { texto: new TextDecoder('utf-8').decode(bytes.subarray(3)), codificacion: 'UTF-8 con BOM' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { texto: new TextDecoder('utf-16le').decode(bytes.subarray(2)), codificacion: 'UTF-16 con BOM' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { texto: new TextDecoder('utf-16be').decode(bytes.subarray(2)), codificacion: 'UTF-16 con BOM' };
  }
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes), codificacion: 'UTF-8' };
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(bytes), codificacion: 'Windows-1252' };
  }
}

// Para la lectura por streaming: decide la codificación con el comienzo del
// archivo. Un carácter de varios bytes puede quedar cortado al final de la
// muestra; esos bytes finales no cuentan como "UTF-8 inválido".
export function decidirCodificacionPorMuestra(muestra: Buffer): Codificacion {
  if (muestra.length >= 3 && muestra[0] === 0xef && muestra[1] === 0xbb && muestra[2] === 0xbf) return 'UTF-8 con BOM';
  if (muestra.length >= 2 && ((muestra[0] === 0xff && muestra[1] === 0xfe) || (muestra[0] === 0xfe && muestra[1] === 0xff))) return 'UTF-16 con BOM';
  for (let recorte = 0; recorte <= 3 && recorte < muestra.length; recorte++) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(muestra.subarray(0, muestra.length - recorte));
      return 'UTF-8';
    } catch {
      // Se prueba sin el último byte por si quedó un carácter cortado.
    }
  }
  return 'Windows-1252';
}

export function etiquetaDeDecodificador(codificacion: Codificacion, muestra: Buffer): string {
  if (codificacion === 'UTF-16 con BOM') return muestra[0] === 0xff ? 'utf-16le' : 'utf-16be';
  return codificacion === 'Windows-1252' ? 'windows-1252' : 'utf-8';
}

// --- Separador ----------------------------------------------------------------

const SEPARADORES: readonly Separador[] = [',', ';', '\t', '|'];

// Cuántos campos tiene cada una de las primeras líneas con cada separador,
// contando solo los separadores que están fuera de comillas. Gana el que da
// la misma cantidad (mayor que uno) en todas; a igualdad, el de más campos.
export function detectarSeparador(texto: string): Separador {
  const lineas = primerasLineasLogicas(texto, 20);
  let mejor: { separador: Separador; campos: number } | null = null;
  for (const separador of SEPARADORES) {
    const cuentas = lineas.map((linea) => contarCamposFueraDeComillas(linea, separador));
    const consistente = cuentas.length > 0 && cuentas.every((cuenta) => cuenta === cuentas[0]) && cuentas[0] > 1;
    if (consistente && (!mejor || cuentas[0] > mejor.campos)) {
      mejor = { separador, campos: cuentas[0] };
    }
  }
  if (mejor) return mejor.separador;
  // Sin uno consistente, el que más aparece en la primera línea (el encabezado).
  const encabezado = lineas[0] ?? '';
  return [...SEPARADORES].sort((a, b) => contarCamposFueraDeComillas(encabezado, b) - contarCamposFueraDeComillas(encabezado, a))[0];
}

// Líneas "lógicas": un salto de línea dentro de un campo entre comillas no
// corta la línea.
function primerasLineasLogicas(texto: string, cantidad: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < texto.length && lineas.length < cantidad; i++) {
    const c = texto[i];
    if (c === '"') enComillas = !enComillas;
    if (!enComillas && (c === '\n' || c === '\r')) {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      if (actual.trim() !== '') lineas.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim() !== '' && lineas.length < cantidad) lineas.push(actual);
  return lineas;
}

function contarCamposFueraDeComillas(linea: string, separador: string): number {
  let campos = 1;
  let enComillas = false;
  for (const c of linea) {
    if (c === '"') enComillas = !enComillas;
    else if (c === separador && !enComillas) campos++;
  }
  return campos;
}

// --- Números ------------------------------------------------------------------

const ENTERO = /^[+-]?\d+$/;
// Punto decimal, con o sin coma de miles ("1,234.56", "1234.56", "3.5", "2e-3").
const CON_PUNTO = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][+-]?\d+)?$/;
// Coma decimal, con o sin punto de miles ("1.234,56", "1234,56", "25,5").
const CON_COMA = /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

function leerConPunto(valor: string): number {
  return Number(valor.replace(/,/g, ''));
}

function leerConComa(valor: string): number {
  return Number(valor.replace(/\./g, '').replace(',', '.'));
}

export type ReglaDeColumna = 'texto' | 'entero' | 'punto decimal' | 'coma decimal';

// Cómo leer una columna, mirando TODOS sus valores no vacíos. Si se pueden
// leer con las dos convenciones y dan los mismos números (enteros, o valores
// como "12.5" que la coma decimal no admite), no hay duda. Si las dos
// convenciones los admiten pero dan números distintos ("1,234": ¿mil
// doscientos o uno coma dos?), la columna queda como texto con un aviso.
export function decidirReglaDeColumna(valores: string[]): { regla: ReglaDeColumna; aviso?: string } {
  const noVacios = valores.map((v) => v.trim()).filter((v) => v !== '');
  if (noVacios.length === 0) return { regla: 'texto' };
  if (noVacios.every((v) => ENTERO.test(v))) return { regla: 'entero' };

  const conPunto = noVacios.every((v) => CON_PUNTO.test(v));
  const conComa = noVacios.every((v) => CON_COMA.test(v));
  if (conPunto && !conComa) return { regla: 'punto decimal' };
  if (conComa && !conPunto) return { regla: 'coma decimal' };
  if (!conPunto && !conComa) return { regla: 'texto' };

  const iguales = noVacios.every((v) => leerConPunto(v) === leerConComa(v));
  if (iguales) return { regla: 'punto decimal' };
  return {
    regla: 'texto',
    aviso:
      `todos sus valores se pueden leer de dos formas que dan números distintos (por ejemplo "${noVacios.find((v) => leerConPunto(v) !== leerConComa(v))}": ` +
      'con el punto o la coma como separador de miles, o como decimal). Se dejó como texto para no cambiar su magnitud.'
  };
}

export function convertirSegunRegla(valor: string, regla: ReglaDeColumna): unknown {
  const limpio = valor.trim();
  if (limpio === '') return limpio;
  switch (regla) {
    case 'entero':
    case 'punto decimal':
      return CON_PUNTO.test(limpio) ? leerConPunto(limpio) : valor;
    case 'coma decimal':
      return CON_COMA.test(limpio) ? leerConComa(limpio) : valor;
    case 'texto':
      return valor;
  }
}

function convencionDelArchivo(reglas: ReglaDeColumna[]): ConvencionDecimal {
  const conComa = reglas.includes('coma decimal');
  const conPunto = reglas.includes('punto decimal');
  if (conComa && conPunto) return 'mixta';
  if (conComa) return 'coma decimal';
  if (conPunto) return 'punto decimal';
  return 'sin decimales';
}

// --- Lectura completa ---------------------------------------------------------

export interface LecturaDelimitada {
  columnas: string[];
  // Cada valor ya convertido según la regla de su columna; una celda vacía
  // llega como `valorVacio`.
  filas: Array<Record<string, unknown>>;
  informacion: InformacionDeLectura;
}

export function leerTextoDelimitado(
  bytes: Buffer,
  opciones: { separador?: Separador; valorVacio?: unknown } = {}
): LecturaDelimitada {
  const { texto, codificacion } = decodificar(bytes);
  const separador = opciones.separador ?? detectarSeparador(texto);
  const crudas = parse(texto, {
    delimiter: separador,
    columns: (encabezado: string[]) => encabezado.map((nombre) => nombre.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as Array<Record<string, string>>;

  const columnas = crudas.length > 0 ? Object.keys(crudas[0]) : columnasDelEncabezado(texto, separador);
  const { reglas, avisos } = decidirReglas(columnas, crudas);
  const valorVacio = 'valorVacio' in opciones ? opciones.valorVacio : null;

  return {
    columnas,
    filas: crudas.map((fila) => convertirFila(fila, columnas, reglas, valorVacio, false)),
    informacion: { codificacion, separador, convencionDecimal: convencionDelArchivo(Object.values(reglas)), avisos }
  };
}

function decidirReglas(
  columnas: string[],
  crudas: Array<Record<string, string>>
): { reglas: Record<string, ReglaDeColumna>; avisos: string[] } {
  const reglas: Record<string, ReglaDeColumna> = {};
  const avisos: string[] = [];
  for (const columna of columnas) {
    const { regla, aviso } = decidirReglaDeColumna(crudas.map((fila) => fila[columna] ?? ''));
    reglas[columna] = regla;
    if (aviso) avisos.push(`La columna "${columna}" quedó como texto: ${aviso}`);
  }
  return { reglas, avisos };
}

// `porMuestra`: la regla salió de las primeras filas (streaming). Si una
// columna de enteros trae más adelante un valor con decimales, ese valor se
// decide solo, con la misma regla de ambigüedad: si se puede leer de dos
// formas que dan números distintos, queda como texto.
function convertirFila(
  fila: Record<string, string>,
  columnas: string[],
  reglas: Record<string, ReglaDeColumna>,
  valorVacio: unknown,
  porMuestra: boolean
): Record<string, unknown> {
  return Object.fromEntries(
    columnas.map((columna) => {
      const crudo = fila[columna] ?? '';
      if (crudo.trim() === '') return [columna, valorVacio];
      let regla = reglas[columna];
      if (porMuestra && regla === 'entero' && !ENTERO.test(crudo.trim())) {
        regla = decidirReglaDeColumna([crudo]).regla;
      }
      return [columna, convertirSegunRegla(crudo, regla)];
    })
  );
}

// --- Lectura por streaming (catálogo, CSV de cientos de MB) -----------------

// Cuántas filas se miran para decidir la regla de cada columna antes de
// empezar a entregar filas. Acota la memoria igual que el resto del streaming.
export const FILAS_DE_MUESTRA = 1000;
const BYTES_DE_MUESTRA = 64 * 1024;

export interface LecturaDelimitadaEnStreaming {
  columnas: string[];
  informacion: InformacionDeLectura;
  filas: AsyncIterable<Record<string, unknown>>;
}

// Misma decisión que leerTextoDelimitado, pero sin cargar el archivo: la
// codificación y el separador salen de los primeros 64 KB, y la regla de cada
// columna de las primeras FILAS_DE_MUESTRA filas.
export async function abrirTextoDelimitadoEnStreaming(
  filePath: string,
  opciones: { separador?: Separador; valorVacio?: unknown } = {}
): Promise<LecturaDelimitadaEnStreaming> {
  const muestra = await leerComienzo(filePath, BYTES_DE_MUESTRA);
  const codificacion = decidirCodificacionPorMuestra(muestra);
  const etiqueta = etiquetaDeDecodificador(codificacion, muestra);
  // TextDecoder quita el BOM por su cuenta.
  const separador = opciones.separador ?? detectarSeparador(new TextDecoder(etiqueta).decode(muestra));

  const decodificador = new TextDecoder(etiqueta);
  const aTexto = new Transform({
    transform(trozo: Buffer, _codificacion, listo) {
      listo(null, decodificador.decode(trozo, { stream: true }));
    },
    flush(listo) {
      listo(null, decodificador.decode());
    }
  });
  const parser = fs
    .createReadStream(filePath)
    .pipe(aTexto)
    .pipe(
      parseEnStreaming({
        delimiter: separador,
        columns: (encabezado: string[]) => encabezado.map((nombre) => nombre.trim()),
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
      })
    );
  const iterador = (parser as AsyncIterable<Record<string, string>>)[Symbol.asyncIterator]();

  const primeras: Array<Record<string, string>> = [];
  while (primeras.length < FILAS_DE_MUESTRA) {
    const siguiente = await iterador.next();
    if (siguiente.done) break;
    primeras.push(siguiente.value);
  }
  const columnas = primeras.length > 0 ? Object.keys(primeras[0]) : [];
  const { reglas, avisos } = decidirReglas(columnas, primeras);
  const valorVacio = 'valorVacio' in opciones ? opciones.valorVacio : null;

  async function* filas(): AsyncGenerator<Record<string, unknown>> {
    for (const fila of primeras) yield convertirFila(fila, columnas, reglas, valorVacio, true);
    primeras.length = 0;
    for (;;) {
      const siguiente = await iterador.next();
      if (siguiente.done) return;
      yield convertirFila(siguiente.value, columnas, reglas, valorVacio, true);
    }
  }

  return {
    columnas,
    informacion: { codificacion, separador, convencionDecimal: convencionDelArchivo(Object.values(reglas)), avisos },
    filas: filas()
  };
}

async function leerComienzo(filePath: string, bytes: number): Promise<Buffer> {
  const archivo = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await archivo.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await archivo.close();
  }
}

function columnasDelEncabezado(texto: string, separador: Separador): string[] {
  const [primera] = primerasLineasLogicas(texto, 1);
  if (!primera) return [];
  const [encabezado] = parse(primera, { delimiter: separador, trim: true }) as string[][];
  return encabezado ?? [];
}

// Lo que viaja en la respuesta de carga para que la pantalla lo muestre.
export function resumirLectura(informacion: InformacionDeLectura): {
  codificacion: string;
  separador: string;
  convencionDecimal: string;
  descripcion: string;
  avisos: string[];
} {
  return {
    codificacion: informacion.codificacion,
    separador: NOMBRE_DE_SEPARADOR[informacion.separador],
    convencionDecimal: informacion.convencionDecimal,
    descripcion: describirLectura(informacion),
    avisos: informacion.avisos
  };
}

// Cómo se le cuenta al analista ("UTF-8, separado por punto y coma, con coma
// decimal").
export function describirLectura(informacion: InformacionDeLectura): string {
  const decimales =
    informacion.convencionDecimal === 'sin decimales'
      ? 'sin números con decimales'
      : informacion.convencionDecimal === 'mixta'
        ? 'con columnas en coma decimal y otras en punto decimal'
        : `con ${informacion.convencionDecimal}`;
  return `${informacion.codificacion}, separado por ${NOMBRE_DE_SEPARADOR[informacion.separador]}, ${decimales}`;
}
