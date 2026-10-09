import ExcelJS from 'exceljs';
import { CeldaDeTabla, ExportadorDeTablaExcel, TablaParaExcel } from '../../../../application/ports/out/exportacion/ExportadorDeTablaExcel';

const ANCHO_MINIMO_COLUMNA = 10;
const ANCHO_MAXIMO_COLUMNA = 60;
const ANCHO_DE_FECHA = 20;
const LARGO_MAXIMO_NOMBRE_DE_HOJA = 31;

// Los textos se escriben como celdas de texto del formato .xlsx, así que uno
// que empiece con "=" se muestra tal cual: no se evalúa como fórmula (eso
// pasa en un .csv, no acá) y no hace falta alterarlo.
function largoDeCelda(celda: CeldaDeTabla): number {
  if (celda === null) return 0;
  if (celda instanceof Date) return ANCHO_DE_FECHA;
  return String(celda).length;
}

// Excel no admite \ / ? * [ ] : en el nombre de una hoja ni más de 31 caracteres.
function nombreDeHojaValido(nombre: string): string {
  const limpio = nombre.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_NOMBRE_DE_HOJA);
  return limpio === '' ? 'Hoja 1' : limpio;
}

export class ExportadorDeTablaExcelJs implements ExportadorDeTablaExcel {
  async exportar(tabla: TablaParaExcel): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'SIADE';

    const hoja = libro.addWorksheet(nombreDeHojaValido(tabla.nombreDeHoja));
    const encabezado = hoja.addRow(tabla.encabezados);
    encabezado.eachCell((celda) => {
      celda.font = { bold: true };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    });

    for (const fila of tabla.filas) {
      const agregada = hoja.addRow(fila);
      fila.forEach((celda, indice) => {
        if (celda instanceof Date) agregada.getCell(indice + 1).numFmt = 'yyyy-mm-dd hh:mm';
      });
    }

    tabla.encabezados.forEach((titulo, indice) => {
      const masLargo = tabla.filas.reduce((maximo, fila) => Math.max(maximo, largoDeCelda(fila[indice] ?? null)), titulo.length);
      hoja.getColumn(indice + 1).width = Math.min(ANCHO_MAXIMO_COLUMNA, Math.max(ANCHO_MINIMO_COLUMNA, masLargo + 2));
    });

    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    if (tabla.encabezados.length > 0) {
      hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tabla.encabezados.length } };
    }

    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
