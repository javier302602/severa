import ExcelJS from 'exceljs';
import { construirExcelAgrupadoPorSeveridad } from '../../src/infrastructure/adapters/out/dataset/ExportadorExcelAgrupado';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

async function leerHoja(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as any);
  return libro.worksheets[0];
}

// Bug real reportado: "un solo cuadro sin separación visual". Este test
// verifica el .xlsx REAL (releído con exceljs, no un mock) — color de fondo
// y celdas fusionadas por bloque de severidad, que la librería "xlsx" usada
// en el resto del proyecto no puede escribir (verificado por separado).
describe('ExportadorExcelAgrupado', () => {
  const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
  const alta = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'));

  test('produce un .xlsx real (releíble) con un bloque fusionado y coloreado por severidad', async () => {
    const buffer = await construirExcelAgrupadoPorSeveridad([critica, alta]);
    const hoja = await leerHoja(buffer);

    // Fila 1: título de bloque "SEVERIDAD: CRÍTICA (1 vulnerabilidades)", fusionado y con color rojo real.
    const filaTitulo = hoja.getRow(1);
    expect(String(filaTitulo.getCell(1).value)).toContain('SEVERIDAD: CRÍTICA');
    expect(hoja.getCell('B1').isMerged).toBe(true);
    expect((filaTitulo.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFDC2626');
    expect(filaTitulo.getCell(1).font?.bold).toBe(true);

    // Fila 2: encabezado de columnas del bloque.
    expect(hoja.getRow(2).getCell(1).value).toBe('CVE');
    expect(hoja.getRow(2).getCell(1).font?.bold).toBe(true);

    // Fila 3: dato real de la crítica.
    expect(hoja.getRow(3).getCell(1).value).toBe('CVE-2021-44228');
    expect(hoja.getRow(3).getCell(3).value).toBe('Crítica');

    // El segundo bloque (Alta) también existe, coloreado distinto (naranja).
    let filaTituloAlta: ExcelJS.Row | undefined;
    hoja.eachRow((fila) => {
      if (String(fila.getCell(1).value).includes('SEVERIDAD: ALTA')) {
        filaTituloAlta = fila;
      }
    });
    expect(filaTituloAlta).toBeDefined();
    expect((filaTituloAlta!.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFEA580C');
  });

  test('fila con campo opcional vacío marca "✓" en la columna Revisar', async () => {
    const sinAcceso = new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'OpenSSL');
    const buffer = await construirExcelAgrupadoPorSeveridad([sinAcceso]);
    const hoja = await leerHoja(buffer);

    expect(hoja.getRow(2).getCell(8).value).toBe('Revisar');
    expect(hoja.getRow(3).getCell(8).value).toBe('✓');
  });

  test('sin vulnerabilidades, el archivo es válido pero sin bloques', async () => {
    const buffer = await construirExcelAgrupadoPorSeveridad([]);
    const hoja = await leerHoja(buffer);

    expect(hoja.rowCount).toBe(0);
  });

  // Bug real reproducido en vivo (2026-07-20, dataset real de 343.441 filas
  // vía /dataset/exportar): construir el libro con la API "en memoria"
  // normal de exceljs (Workbook + addRow, sin streaming) mantenía TODAS las
  // filas como objetos Cell/Row vivos hasta el final — el proceso terminaba
  // en "FATAL ERROR: JavaScript heap out of memory" real (confirmado con
  // docker logs) y el contenedor se reiniciaba solo. Se corrigió con el
  // writer en streaming de exceljs (WorkbookWriter, cada fila se compromete
  // y se libera apenas se escribe). 343.441 para reproducir exactamente la
  // misma escala del dataset real que crasheaba.
  test('con 343.441 filas reales no crashea ni pierde datos (bug real reproducido y corregido)', async () => {
    const vulnerabilidades = Array.from({ length: 343_441 }, (_, i) => {
      const cvss = (i % 101) / 10;
      return new Vulnerabilidad(String(i), new IdentificadorCVE(`CVE-2036-${String(i).padStart(7, '0')}`), new CvssScore(cvss), 'Software de prueba', new TipoAccesoValue(i % 2 === 0 ? 'Sí' : 'No'));
    });

    const buffer = await construirExcelAgrupadoPorSeveridad(vulnerabilidades);
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // firma de archivo .xlsx (zip)

    const hoja = await leerHoja(buffer);
    let totalFilasDeDatos = 0;
    hoja.eachRow((fila) => {
      if (/^CVE-2036-\d{7}$/.test(String(fila.getCell(1).value))) {
        totalFilasDeDatos++;
      }
    });
    expect(totalFilasDeDatos).toBe(343_441);
  }, 60_000);
});
