import ExcelJS from 'exceljs';
import { BloqueDeInforme } from './BloquesDeInforme';

// RF-79: "exportar cualquier tabla generada" a .xlsx. Las tablas generadas
// son exactamente los bloques 'tabla' del informe (ver BloquesDeInforme.ts),
// así que se exportan TODAS, una por hoja, sin una lista aparte que haya que
// mantener al día: una tabla que se agregue al informe aparece acá sola.
//
// La primera hoja es un índice (qué hay en cada hoja y de qué sección del
// informe salió), porque Excel limita el nombre de una hoja a 31 caracteres y
// "9. Estadística descriptiva — Tendencia central" no entra.

const LARGO_MAXIMO_NOMBRE_DE_HOJA = 31;
const ANCHO_MINIMO_COLUMNA = 8;
const ANCHO_MAXIMO_COLUMNA = 60;

export interface TablaDeInforme {
  seccion: string;
  subseccion: string | null;
  encabezados: string[];
  filas: string[][];
}

// Recorre los bloques recordando bajo qué encabezados aparece cada tabla.
// Exportada para que RF-38 (tabla de frecuencias) y los tests puedan
// localizar una tabla puntual por su sección.
export function extraerTablasDeInforme(bloques: BloqueDeInforme[]): TablaDeInforme[] {
  const tablas: TablaDeInforme[] = [];
  let seccion = 'Portada';
  let subseccion: string | null = null;

  for (const bloque of bloques) {
    if (bloque.tipo === 'encabezado') {
      if (bloque.nivel === 1) {
        seccion = bloque.texto;
        subseccion = null;
      } else {
        subseccion = bloque.texto;
      }
    } else if (bloque.tipo === 'tabla') {
      tablas.push({ seccion, subseccion, encabezados: bloque.encabezados, filas: bloque.filas });
    }
  }
  return tablas;
}

// Las tablas del informe llevan los números ya formateados como texto
// ("7.50"). En Excel, un número guardado como texto no suma ni ordena, y el
// requisito es exportar "para análisis adicionales": se convierte a número
// lo que es inequívocamente un número decimal simple. Se deja como texto:
//   - lo que tiene ceros a la izquierda ("00123" es un código, no 123);
//   - porcentajes, rangos, notación científica y cualquier otra cosa con más
//     que dígitos, signo y un punto — convertirlos exige adivinar formato;
//   - enteros de 16 dígitos o más, que un double no representa exactos.
function valorDeCelda(texto: string): string | number {
  if (!/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(texto)) return texto;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : texto;
}

// Excel no admite \ / ? * [ ] : en el nombre de una hoja, ni que empiece o
// termine con comilla simple, ni nombres repetidos (sin distinguir mayúsculas).
function nombreDeHoja(numero: number, tabla: TablaDeInforme, usados: Set<string>): string {
  const prefijo = `${numero}. `;
  // Se quita la numeración que el encabezado ya trae ("9. Estadística...",
  // "12.1 Gráfico 1: ..."): la hoja lleva la suya, y dos números seguidos
  // gastan casi la mitad de los 31 caracteres disponibles. Solo si tiene
  // forma de numeración (con punto): una columna llamada "2024 ventas" es un
  // nombre, no un número de sección.
  const descripcion = (tabla.subseccion ?? tabla.seccion)
    .replace(/^(\d+\.\s+|\d+(\.\d+)+\s+)/, '')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let nombre = `${prefijo}${descripcion}`.slice(0, LARGO_MAXIMO_NOMBRE_DE_HOJA).replace(/^'+|'+$/g, '').trim();
  if (nombre === '' || usados.has(nombre.toLowerCase())) nombre = `${prefijo}Tabla`.slice(0, LARGO_MAXIMO_NOMBRE_DE_HOJA);
  usados.add(nombre.toLowerCase());
  return nombre;
}

const ESTILO_ENCABEZADO: Partial<ExcelJS.Style> = {
  font: { bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  alignment: { vertical: 'top', wrapText: true }
};

function ajustarAnchos(hoja: ExcelJS.Worksheet, encabezados: string[], filas: string[][]): void {
  encabezados.forEach((encabezado, indice) => {
    const masLargo = filas.reduce((maximo, fila) => Math.max(maximo, (fila[indice] ?? '').length), encabezado.length);
    hoja.getColumn(indice + 1).width = Math.min(ANCHO_MAXIMO_COLUMNA, Math.max(ANCHO_MINIMO_COLUMNA, masLargo + 2));
  });
}

export async function construirExcelDeTablasDeInforme(bloques: BloqueDeInforme[]): Promise<Buffer> {
  const tablas = extraerTablasDeInforme(bloques);
  const tituloInforme = bloques.find((bloque): bloque is Extract<BloqueDeInforme, { tipo: 'titulo' }> => bloque.tipo === 'titulo')?.texto ?? 'Informe SIADE';

  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIADE';

  const indice = libro.addWorksheet('Índice');
  indice.addRow([tituloInforme]).font = { bold: true, size: 14 };
  indice.addRow([`${tablas.length} tabla(s) del informe, una por hoja.`]);
  indice.addRow([]);
  const encabezadoIndice = indice.addRow(['Hoja', 'Sección del informe', 'Subsección', 'Filas', 'Columnas']);
  encabezadoIndice.eachCell((celda) => Object.assign(celda, { style: ESTILO_ENCABEZADO }));

  const usados = new Set<string>(['índice']);
  tablas.forEach((tabla, posicion) => {
    const nombre = nombreDeHoja(posicion + 1, tabla, usados);
    const hoja = libro.addWorksheet(nombre);
    hoja.addRow(tabla.encabezados).eachCell((celda) => Object.assign(celda, { style: ESTILO_ENCABEZADO }));
    tabla.filas.forEach((fila) => hoja.addRow(fila.map(valorDeCelda)));
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    ajustarAnchos(hoja, tabla.encabezados, tabla.filas);

    const filaIndice = indice.addRow([nombre, tabla.seccion, tabla.subseccion ?? '', tabla.filas.length, tabla.encabezados.length]);
    // Enlace interno a la hoja: el índice sirve para navegar, no solo para leer.
    filaIndice.getCell(1).value = { text: nombre, hyperlink: `#'${nombre.replace(/'/g, "''")}'!A1` };
    filaIndice.getCell(1).font = { color: { argb: 'FF1D4ED8' }, underline: true };
  });

  indice.getColumn(1).width = 34;
  indice.getColumn(2).width = 40;
  indice.getColumn(3).width = 55;
  indice.getColumn(4).width = 9;
  indice.getColumn(5).width = 11;

  return Buffer.from(await libro.xlsx.writeBuffer());
}
