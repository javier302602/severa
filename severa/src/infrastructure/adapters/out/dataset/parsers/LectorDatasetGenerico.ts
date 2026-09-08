import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { DatasetInvalidoError } from '../../../../../domain/errors/DatasetInvalidoError';

// Mejora 4 — Fase 2. A diferencia de LectorExcelDataset.ts (que asume
// columnas fijas de vulnerabilidades), este lector no sabe nada de antemano
// sobre la forma del archivo: devuelve exactamente las columnas y filas que
// tenga, tal cual. Reutiliza DatasetInvalidoError porque su mensaje ya es
// genérico (no menciona vulnerabilidades) — no hace falta un error nuevo
// para el mismo problema (archivo corrupto / sin hojas / sin filas).
//
// M-14 (RF-105): 4 formatos, 2 caminos de lectura reales.
//   - .xlsx/.xls/.csv: SheetJS (paquete "xlsx"), misma XLSX.readFile de
//     siempre — detecta el formato por extensión/contenido internamente.
//   - .tsv: SheetJS también, pero SIN confiar en que readFile reconozca la
//     extensión .tsv (a diferencia de .csv, no hay garantía de que esté en
//     su tabla interna de extensiones conocidas) — se lee el archivo como
//     texto y se fuerza el separador de campo explícitamente (FS: '\t').
//   - .json: SheetJS no tiene ningún modo de "leer JSON como planilla" (
//     XLSX.utils.json_to_sheet sirve para ESCRIBIR, no para leer) — camino
//     totalmente aparte, JSON.parse + validación de que sea un array de
//     objetos (formato tabular), sin pasar por SheetJS en absoluto.
export interface ResultadoLecturaGenerica {
  columnas: string[];
  filas: Array<Record<string, unknown>>;
}

export class LectorDatasetGenerico {
  leerArchivo(filePath: string): ResultadoLecturaGenerica {
    if (!fs.existsSync(filePath)) {
      throw new Error(`No existe el archivo: ${filePath}`);
    }

    const extension = path.extname(filePath).toLowerCase();

    if (extension === '.json') {
      return this.leerJson(filePath);
    }

    return this.leerConSheetJs(filePath, extension);
  }

  private leerConSheetJs(filePath: string, extension: string): ResultadoLecturaGenerica {
    let workbook: XLSX.WorkBook;
    try {
      if (extension === '.tsv') {
        // cellDates:true hace que las celdas de fecha lleguen como objetos
        // Date reales cuando el origen las tipa así (Excel) — en un TSV de
        // texto plano nunca hay celdas tipadas, pero se deja el flag por
        // consistencia con el resto de los formatos leídos acá.
        const contenido = fs.readFileSync(filePath, 'utf-8');
        workbook = XLSX.read(contenido, { type: 'string', FS: '\t', cellDates: true });
      } else {
        workbook = XLSX.readFile(filePath, { cellDates: true });
      }
    } catch (error) {
      throw new DatasetInvalidoError(
        `El archivo está corrupto o no es un Excel/CSV/TSV válido: ${error instanceof Error ? error.message : 'error desconocido'}`
      );
    }

    const primeraHoja = workbook.SheetNames[0];
    if (!primeraHoja) {
      throw new DatasetInvalidoError('El archivo no contiene ninguna hoja');
    }

    const sheet = workbook.Sheets[primeraHoja];
    // defval:null (no '' como en LectorExcelDataset.ts) porque acá una
    // celda vacía SÍ importa para el diagnóstico de calidad — necesita
    // distinguirse limpiamente de un valor real, no confundirse con un
    // string vacío que en teoría podría ser un valor categórico válido.
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Array<Record<string, unknown>>;

    if (filas.length === 0) {
      throw new DatasetInvalidoError('El archivo no contiene filas de datos');
    }

    return { columnas: Object.keys(filas[0]), filas };
  }

  private leerJson(filePath: string): ResultadoLecturaGenerica {
    let contenido: unknown;
    try {
      contenido = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      throw new DatasetInvalidoError(
        `El archivo no es JSON válido: ${error instanceof Error ? error.message : 'error desconocido'}`
      );
    }

    if (!Array.isArray(contenido)) {
      throw new DatasetInvalidoError('El archivo JSON debe contener un array de objetos (formato tabular) en su nivel superior');
    }
    if (contenido.length === 0) {
      throw new DatasetInvalidoError('El archivo no contiene filas de datos');
    }
    const todasSonFilas = contenido.every(
      (elemento) => typeof elemento === 'object' && elemento !== null && !Array.isArray(elemento)
    );
    if (!todasSonFilas) {
      throw new DatasetInvalidoError('Cada elemento del array JSON debe ser un objeto (una fila), no un valor suelto ni otro array');
    }

    const filas = contenido as Array<Record<string, unknown>>;
    return { columnas: Object.keys(filas[0]), filas };
  }
}
