import fs from 'fs';
import { Transform } from 'stream';
import { parse } from 'csv-parse/sync';
import { parse as parseEnStreaming } from 'csv-parse';
import { esValorFaltante } from '../../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { UMBRAL_MAYORIA } from '../../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import {
  CON_COMA,
  CON_PUNTO,
  ENTERO,
  esCodigoConCerosALaIzquierda,
  leerConComa,
  leerConPunto,
  tieneLecturaAmbigua
} from '../../../../../domain/services/variable-detection/LecturaDeNumerosEnTexto';

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
//     UTF-8 válido, Windows-1252 (el "ANSI" de Excel en Windows), decodificado
//     con una tabla propia: TextDecoder('windows-1252') depende del runtime
//     (Node 22.22.0 lo trata como latin-1 y pierde “ ” y €);
//   - separador: coma, punto y coma, tabulación o barra, el que reparte las
//     primeras líneas en la misma cantidad de campos, respetando comillas; si
//     el encabezado no tiene ninguno, el archivo es de una sola columna;
//   - celdas: siempre como texto; los números los convierte una regla propia
//     POR COLUMNA (ver decidirReglaDeColumna), que nunca cambia una magnitud
//     en silencio;
//   - nada se pierde sin avisar: una fila con más campos que el encabezado
//     conserva los de más en columnas aparte y se avisa cuántas son.

export type Codificacion = 'UTF-8 con BOM' | 'UTF-8' | 'Windows-1252' | 'UTF-16 con BOM';
export type Separador = ',' | ';' | '\t' | '|';
export type ConvencionDecimal = 'punto decimal' | 'coma decimal' | 'mixta' | 'sin decimales';

export interface InformacionDeLectura {
  codificacion: Codificacion;
  // null: el archivo tiene una sola columna (el encabezado no tiene separador).
  separador: Separador | null;
  convencionDecimal: ConvencionDecimal;
  // Lo que el analista tiene que saber: columnas que no se convirtieron a
  // número y por qué, filas con campos de más.
  avisos: string[];
}

export const NOMBRE_DE_SEPARADOR: Record<Separador, string> = {
  ',': 'coma',
  ';': 'punto y coma',
  '\t': 'tabulación',
  '|': 'barra vertical'
};

// --- Codificación -------------------------------------------------------------

// Windows-1252 coincide con latin-1 salvo en 0x80–0x9F, donde tiene comillas
// tipográficas, €, guiones, etc. Tabla de la codificación (WHATWG); las cinco
// posiciones sin carácter asignado quedan como el control de latin-1.
const WINDOWS_1252_80_9F = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
];

export function decodificarWindows1252(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .toString('latin1')
    .replace(/[\x80-\x9f]/g, (c) => String.fromCharCode(WINDOWS_1252_80_9F[c.charCodeAt(0) - 0x80]));
}

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
    return { texto: decodificarWindows1252(bytes), codificacion: 'Windows-1252' };
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

interface Decodificador {
  decode(trozo?: Uint8Array, opciones?: { stream?: boolean }): string;
}

// Decodificador por trozos. TextDecoder quita el BOM por su cuenta; Windows-1252
// es de un byte por carácter, así que no hay nada que arrastrar entre trozos.
function crearDecodificador(codificacion: Codificacion, muestra: Buffer): Decodificador {
  switch (codificacion) {
    case 'Windows-1252':
      return { decode: (trozo) => (trozo ? decodificarWindows1252(trozo) : '') };
    case 'UTF-16 con BOM':
      return new TextDecoder(muestra[0] === 0xff ? 'utf-16le' : 'utf-16be');
    default:
      return new TextDecoder('utf-8');
  }
}

// --- Separador ----------------------------------------------------------------

const SEPARADORES: readonly Separador[] = [',', ';', '\t', '|'];

// Delimitador para leer un archivo de una sola columna: un carácter de control
// que no aparece en texto real, para que una coma decimal ("12,5") no parta
// el valor en dos.
const DELIMITADOR_DE_UNA_COLUMNA = '\u001f';

// Cuántos campos tiene cada una de las primeras líneas con cada separador,
// contando solo los separadores que están fuera de comillas. Gana el que da
// la misma cantidad (mayor que uno) en todas; a igualdad, el de más campos.
// null si el encabezado no tiene ningún separador: una sola columna.
export function detectarSeparador(texto: string): Separador | null {
  const lineas = primerasLineasLogicas(texto, 20);
  const encabezado = lineas[0] ?? '';
  if (SEPARADORES.every((separador) => contarCamposFueraDeComillas(encabezado, separador) === 1)) return null;

  let mejor: { separador: Separador; campos: number } | null = null;
  for (const separador of SEPARADORES) {
    const cuentas = lineas.map((linea) => contarCamposFueraDeComillas(linea, separador));
    const consistente = cuentas.length > 0 && cuentas.every((cuenta) => cuenta === cuentas[0]) && cuentas[0] > 1;
    if (consistente && (!mejor || cuentas[0] > mejor.campos)) {
      mejor = { separador, campos: cuentas[0] };
    }
  }
  if (mejor) return mejor.separador;
  // Sin uno consistente, el que más aparece en el encabezado.
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

// Las expresiones y las dos lecturas viven en el dominio
// (LecturaDeNumerosEnTexto): el detector de tipos usa las mismas.

function pareceNumero(valor: string): boolean {
  return CON_PUNTO.test(valor) || CON_COMA.test(valor);
}

// Una celda que se lee igual con las dos convenciones (o que solo una admite).
function lecturaInequivoca(valor: string): ReglaDeColumna {
  const conPunto = CON_PUNTO.test(valor);
  const conComa = CON_COMA.test(valor);
  if (conPunto && conComa) return tieneLecturaAmbigua(valor) ? 'texto' : 'punto decimal';
  if (conPunto) return 'punto decimal';
  return conComa ? 'coma decimal' : 'texto';
}

export type ReglaDeColumna = 'texto' | 'entero' | 'punto decimal' | 'coma decimal' | 'por celda';

// Cómo leer una columna, mirando todos sus valores.
//   - Los vacíos y los marcadores de faltante que reconoce el dominio (NA,
//     N/A, NULL, -, ?: esValorFaltante) no deciden nada y quedan como están,
//     para que se sigan contando como faltantes.
//   - Si algún valor empieza con 0 seguido de más dígitos ("07001"), la
//     columna es de códigos: queda como texto.
//   - La columna es numérica con el mismo criterio de mayoría que el detector
//     de tipos (UMBRAL_MAYORIA de los valores parecen números). Entonces la
//     convención se decide con los valores que parecen números: los que solo
//     admiten una lectura ("12.5" solo con punto, "25,5" solo con coma) la
//     deciden. Si aparecen las dos, gana la mayoría y se avisa. Si todos
//     admiten las dos lecturas y dan números distintos ("1,234": ¿mil
//     doscientos o uno coma dos?), queda como texto y se avisa.
//   - Si no llega a la mayoría, es una columna de texto; las celdas sueltas
//     que se leen igual con las dos convenciones se convierten una por una
//     ('por celda'), como hacía XLSX.readFile.
// En una columna numérica, la celda que no es un número queda como texto y el
// diagnóstico de calidad la cuenta como inconsistente.
export function decidirReglaDeColumna(valores: string[]): { regla: ReglaDeColumna; aviso?: string } {
  const candidatos = valores.map((v) => v.trim()).filter((v) => !esValorFaltante(v));
  if (candidatos.length === 0) return { regla: 'texto' };
  if (candidatos.some(esCodigoConCerosALaIzquierda)) return { regla: 'texto' };

  const numeros = candidatos.filter(pareceNumero);
  if (numeros.length / candidatos.length < UMBRAL_MAYORIA) return { regla: 'por celda' };
  if (numeros.every((v) => ENTERO.test(v))) return { regla: 'entero' };

  const soloConPunto = numeros.filter((v) => CON_PUNTO.test(v) && !CON_COMA.test(v));
  const soloConComa = numeros.filter((v) => CON_COMA.test(v) && !CON_PUNTO.test(v));
  if (soloConPunto.length > 0 && soloConComa.length === 0) return { regla: 'punto decimal' };
  if (soloConComa.length > 0 && soloConPunto.length === 0) return { regla: 'coma decimal' };

  if (soloConPunto.length > 0 && soloConComa.length > 0) {
    if (soloConPunto.length === soloConComa.length) {
      return {
        regla: 'texto',
        aviso:
          `tiene tantos valores con coma decimal (por ejemplo "${soloConComa[0]}") como con punto decimal (por ejemplo "${soloConPunto[0]}"). ` +
          'Se dejó como texto para no elegir una convención al azar.'
      };
    }
    const [regla, minoria, otra] =
      soloConComa.length > soloConPunto.length
        ? (['coma decimal', soloConPunto, 'punto decimal'] as const)
        : (['punto decimal', soloConComa, 'coma decimal'] as const);
    return {
      regla,
      aviso:
        `mezcla coma y punto decimal. Se leyó con ${regla}, la de la mayoría de sus valores; ` +
        `${minoria.length} valor(es) con ${otra} (por ejemplo "${minoria[0]}") quedaron como texto.`
    };
  }

  if (!numeros.some(tieneLecturaAmbigua)) return { regla: 'punto decimal' };
  return {
    regla: 'texto',
    aviso:
      `todos sus valores se pueden leer de dos formas que dan números distintos (por ejemplo "${numeros.find(tieneLecturaAmbigua)}": ` +
      'con el punto o la coma como separador de miles, o como decimal). Se dejó como texto para no cambiar su magnitud.'
  };
}

export function convertirSegunRegla(valor: string, regla: ReglaDeColumna): unknown {
  const limpio = valor.trim();
  // Un código con ceros a la izquierda nunca se convierte (también cuando la
  // regla salió de una muestra y el código aparece después).
  if (limpio === '' || esCodigoConCerosALaIzquierda(limpio)) return valor;
  switch (regla) {
    case 'entero':
    case 'punto decimal':
      return CON_PUNTO.test(limpio) ? leerConPunto(limpio) : valor;
    case 'coma decimal':
      return CON_COMA.test(limpio) ? leerConComa(limpio) : valor;
    case 'por celda': {
      const lectura = lecturaInequivoca(limpio);
      return lectura === 'texto' ? valor : convertirSegunRegla(limpio, lectura);
    }
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

// --- Filas y columnas ---------------------------------------------------------

// Opciones de csv-parse comunes a los dos modos. Sin `columns`: cada fila
// llega como arreglo y los campos se asignan acá, para no perder en silencio
// los que sobran (csv-parse con relax_column_count los descarta).
function opcionesDeParseo(delimitador: string) {
  return { delimiter: delimitador, skip_empty_lines: true, relax_column_count: true, trim: true };
}

// Encabezado sin nombres repetidos (el segundo "monto" pisaría al primero) ni
// vacíos, y nombres para los campos que sobran.
function nombreLibre(base: string, usados: Set<string>): string {
  let nombre = base;
  for (let n = 2; usados.has(nombre); n++) nombre = `${base} (${n})`;
  usados.add(nombre);
  return nombre;
}

class ArmadoDeFilas {
  readonly columnas: string[];
  private readonly usados: Set<string>;
  private readonly extras: string[] = [];
  filasConCamposDeMas = 0;
  primeraFilaConCamposDeMas: number | null = null;

  constructor(encabezado: string[]) {
    this.usados = new Set();
    this.columnas = encabezado.map((nombre) => nombreLibre(nombre.trim() === '' ? 'columna sin nombre' : nombre.trim(), this.usados));
  }

  // `numeroDeFila`: la fila del archivo, contando el encabezado como la 1.
  armar(campos: string[], numeroDeFila: number): Record<string, string> {
    const fila: Record<string, string> = {};
    this.columnas.forEach((columna, i) => {
      fila[columna] = campos[i] ?? '';
    });
    const sobrantes = campos.slice(this.columnas.length);
    // Un separador de más al final de la línea (campos vacíos) no es un dato.
    if (sobrantes.some((campo) => campo.trim() !== '')) {
      this.filasConCamposDeMas++;
      this.primeraFilaConCamposDeMas ??= numeroDeFila;
      sobrantes.forEach((campo, i) => {
        fila[this.nombreExtra(i)] = campo;
      });
    }
    return fila;
  }

  get todasLasColumnas(): string[] {
    return [...this.columnas, ...this.extras];
  }

  aviso(): string | null {
    if (this.filasConCamposDeMas === 0) return null;
    const nombres = this.extras.map((nombre) => `"${nombre}"`).join(', ');
    return (
      `${this.filasConCamposDeMas} fila(s) tienen más campos que el encabezado (la primera es la fila ${this.primeraFilaConCamposDeMas} del archivo). ` +
      `Los campos de más no se descartaron: quedaron en ${this.extras.length === 1 ? 'la columna' : 'las columnas'} ${nombres}. ` +
      'Revisá el separador o las comillas de esas filas.'
    );
  }

  private nombreExtra(indice: number): string {
    while (this.extras.length <= indice) this.extras.push(nombreLibre(`campo extra ${this.extras.length + 1}`, this.usados));
    return this.extras[indice];
  }
}

function decidirReglas(
  columnas: string[],
  filas: Array<Record<string, string>>
): { reglas: Record<string, ReglaDeColumna>; avisos: string[] } {
  const reglas: Record<string, ReglaDeColumna> = {};
  const avisos: string[] = [];
  for (const columna of columnas) {
    const { regla, aviso } = decidirReglaDeColumna(filas.map((fila) => fila[columna] ?? ''));
    reglas[columna] = regla;
    if (aviso) avisos.push(`La columna "${columna}" ${regla === 'texto' ? 'quedó como texto' : 'se leyó con ' + regla}: ${aviso}`);
  }
  return { reglas, avisos };
}

// `porMuestra`: la regla salió de las primeras filas (streaming). Si una
// columna de enteros trae más adelante un valor con decimales, ese valor se
// decide solo, con la misma regla de ambigüedad: si se puede leer de dos
// formas que dan números distintos, queda como texto. Una columna que no
// estaba en la muestra (campos de más que aparecen después) se lee por celda.
function convertirFila(
  fila: Record<string, string>,
  reglas: Record<string, ReglaDeColumna>,
  valorVacio: unknown,
  porMuestra: boolean
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fila).map(([columna, crudo]) => {
      if (crudo.trim() === '') return [columna, valorVacio];
      let regla = reglas[columna] ?? 'por celda';
      if (porMuestra && regla === 'entero' && !ENTERO.test(crudo.trim())) regla = 'por celda';
      return [columna, convertirSegunRegla(crudo, regla)];
    })
  );
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
  const [encabezado = [], ...registros] = parse(texto, opcionesDeParseo(separador ?? DELIMITADOR_DE_UNA_COLUMNA)) as string[][];

  const armado = new ArmadoDeFilas(encabezado);
  const crudas = registros.map((campos, i) => armado.armar(campos, i + 2));
  const columnas = armado.todasLasColumnas;
  const { reglas, avisos } = decidirReglas(columnas, crudas);
  const avisoDeCampos = armado.aviso();
  if (avisoDeCampos) avisos.unshift(avisoDeCampos);
  const valorVacio = 'valorVacio' in opciones ? opciones.valorVacio : null;

  return {
    columnas,
    // Toda fila con todas las columnas (las que no traen un campo de más lo
    // tienen vacío), para que el diagnóstico las cuente bien.
    filas: crudas.map((fila) => convertirFila({ ...Object.fromEntries(columnas.map((c) => [c, ''])), ...fila }, reglas, valorVacio, false)),
    informacion: { codificacion, separador, convencionDecimal: convencionDelArchivo(Object.values(reglas)), avisos }
  };
}

// --- Lectura por streaming (catálogo, CSV de cientos de MB) -----------------

// Cuántas filas se miran para decidir la regla de cada columna antes de
// empezar a entregar filas. Acota la memoria igual que el resto del streaming.
export const FILAS_DE_MUESTRA = 1000;
const BYTES_DE_MUESTRA = 64 * 1024;

export interface LecturaDelimitadaEnStreaming {
  columnas: string[];
  // El aviso de filas con campos de más se agrega a `avisos` al terminar de
  // recorrer `filas`.
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
  const separador = opciones.separador ?? detectarSeparador(crearDecodificador(codificacion, muestra).decode(muestra));

  const decodificador = crearDecodificador(codificacion, muestra);
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
    .pipe(parseEnStreaming(opcionesDeParseo(separador ?? DELIMITADOR_DE_UNA_COLUMNA)));
  const iterador = (parser as AsyncIterable<string[]>)[Symbol.asyncIterator]();

  const primerRegistro = await iterador.next();
  const armado = new ArmadoDeFilas(primerRegistro.done ? [] : primerRegistro.value);
  let numeroDeFila = 1;
  const primeras: Array<Record<string, string>> = [];
  while (primeras.length < FILAS_DE_MUESTRA && !primerRegistro.done) {
    const siguiente = await iterador.next();
    if (siguiente.done) break;
    primeras.push(armado.armar(siguiente.value, ++numeroDeFila));
  }
  const { reglas, avisos } = decidirReglas(armado.columnas, primeras);
  const valorVacio = 'valorVacio' in opciones ? opciones.valorVacio : null;
  const informacion: InformacionDeLectura = {
    codificacion,
    separador,
    convencionDecimal: convencionDelArchivo(Object.values(reglas)),
    avisos
  };

  async function* filas(): AsyncGenerator<Record<string, unknown>> {
    for (const fila of primeras) yield convertirFila(fila, reglas, valorVacio, true);
    primeras.length = 0;
    if (!primerRegistro.done) {
      for (;;) {
        const siguiente = await iterador.next();
        if (siguiente.done) break;
        yield convertirFila(armado.armar(siguiente.value, ++numeroDeFila), reglas, valorVacio, true);
      }
    }
    const avisoDeCampos = armado.aviso();
    if (avisoDeCampos) avisos.unshift(avisoDeCampos);
  }

  return { columnas: armado.columnas, informacion, filas: filas() };
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
    separador: informacion.separador ? NOMBRE_DE_SEPARADOR[informacion.separador] : 'ninguno (una sola columna)',
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
  const columnas = informacion.separador ? `separado por ${NOMBRE_DE_SEPARADOR[informacion.separador]}` : 'en una sola columna';
  return `${informacion.codificacion}, ${columnas}, ${decimales}`;
}
