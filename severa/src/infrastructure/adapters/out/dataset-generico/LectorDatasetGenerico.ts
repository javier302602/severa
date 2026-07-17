import fs from 'fs';
import * as XLSX from 'xlsx';
import { DatasetInvalidoError } from '../../../../domain/errors/DatasetInvalidoError';

// Mejora 4 — Fase 2. A diferencia de LectorExcelDataset.ts (que asume
// columnas fijas de vulnerabilidades), este lector no sabe nada de antemano
// sobre la forma del archivo: devuelve exactamente las columnas y filas que
// tenga, tal cual. Reutiliza DatasetInvalidoError porque su mensaje ya es
// genérico (no menciona vulnerabilidades) — no hace falta un error nuevo
// para el mismo problema (archivo corrupto / sin hojas / sin filas).
//
// SheetJS (paquete "xlsx") lee .xlsx/.xls/.csv con la misma función
// XLSX.readFile — detecta el formato por extensión/contenido, así que este
// lector soporta los tres sin lógica adicional. cellDates:true hace que las
// celdas de fecha de Excel lleguen como objetos Date reales (no como
// números de serie), que es lo que espera esFecha() en
// DetectorDeTipoDeColumna.ts.
export interface ResultadoLecturaGenerica {
  columnas: string[];
  filas: Array<Record<string, unknown>>;
}

export class LectorDatasetGenerico {
  leerArchivo(filePath: string): ResultadoLecturaGenerica {
    if (!fs.existsSync(filePath)) {
      throw new Error(`No existe el archivo: ${filePath}`);
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true });
    } catch (error) {
      throw new DatasetInvalidoError(
        `El archivo está corrupto o no es un Excel/CSV válido: ${error instanceof Error ? error.message : 'error desconocido'}`
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
}
