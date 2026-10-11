import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import {
  decidirCodificacionPorMuestra,
  decidirReglaDeColumna,
  decodificar,
  detectarSeparador,
  leerTextoDelimitado
} from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LecturaDeTextoDelimitado';
import { LectorDatasetGenerico } from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { FilaProcesada, LectorExcelDataset } from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LectorExcelDataset';
import { calcularEstadisticasDescriptivas } from '../../../../../src/domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';

// Lectura de CSV/TSV (paso previo a la tanda e): dos defectos reales que
// corrompían datos sin avisar —UTF-8 sin BOM leído como latin-1 y "25,5"
// leído como 255— con archivos reales escritos en disco, pasando por los
// lectores reales hasta las estadísticas.
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

let carpeta: string;
beforeAll(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-lectura-csv-'));
});
afterAll(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

function escribir(nombre: string, bytes: Buffer): string {
  const ruta = path.join(carpeta, nombre);
  fs.writeFileSync(ruta, bytes);
  return ruta;
}

// Lo que guarda Excel en español con "CSV (delimitado por comas)": punto y
// coma, coma decimal, y tildes en los nombres de columna y en los valores.
const CSV_EXCEL_ES = ['Región;Temperatura;Población', 'Huánuco;25,5;1.234.567', 'Ñuñoa;31,2;208.237'].join('\r\n');

function mediaDe(columnas: string[], filas: Array<Record<string, unknown>>, columna: string): number | undefined {
  const resumen = calcularEstadisticasDescriptivas(columnas, filas).find((r) => r.nombre === columna) as { media?: number } | undefined;
  return resumen?.media;
}

describe('Codificación: decidida sobre los bytes', () => {
  test('UTF-8 sin BOM se lee como UTF-8 (antes "Huánuco" llegaba como "HuÃ¡nuco"), también en los nombres de columna', () => {
    const ruta = escribir('utf8-sin-bom.csv', Buffer.from(CSV_EXCEL_ES, 'utf8'));
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(ruta);

    expect(columnas).toEqual(['Región', 'Temperatura', 'Población']);
    expect(filas.map((f) => f['Región'])).toEqual(['Huánuco', 'Ñuñoa']);
    expect(lectura?.codificacion).toBe('UTF-8');
  });

  test('UTF-8 con BOM: el BOM se quita y no queda pegado al primer nombre de columna', () => {
    const ruta = escribir('utf8-con-bom.csv', Buffer.concat([BOM, Buffer.from(CSV_EXCEL_ES, 'utf8')]));
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(ruta);

    expect(columnas[0]).toBe('Región');
    expect(filas[0]['Región']).toBe('Huánuco');
    expect(lectura?.codificacion).toBe('UTF-8 con BOM');
  });

  test('latin-1 / Windows-1252 (el "ANSI" de Excel): bytes que no son UTF-8 válido se leen como Windows-1252', () => {
    const ruta = escribir('latin1.csv', Buffer.from(CSV_EXCEL_ES, 'latin1'));
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(ruta);

    expect(columnas).toEqual(['Región', 'Temperatura', 'Población']);
    expect(filas.map((f) => f['Región'])).toEqual(['Huánuco', 'Ñuñoa']);
    expect(lectura?.codificacion).toBe('Windows-1252');
  });

  test('Windows-1252 tiene caracteres que latin-1 no (comillas tipográficas, €): se leen bien', () => {
    expect(decodificar(Buffer.from([0x93, 0x41, 0x94, 0x20, 0x80])).texto).toBe('“A” €');
  });

  test('por muestra (streaming): un carácter de varios bytes cortado al final de la muestra no la vuelve "no UTF-8"', () => {
    const completo = Buffer.from('ciudad\nHuánuco', 'utf8');
    const cortado = completo.subarray(0, completo.indexOf(0xa1)); // queda solo el primer byte de "á"
    expect(decidirCodificacionPorMuestra(cortado)).toBe('UTF-8');
    expect(decidirCodificacionPorMuestra(Buffer.from('ciudad\nHuánuco', 'latin1'))).toBe('Windows-1252');
  });
});

describe('Separador: detectado respetando comillas', () => {
  test.each([
    ['coma', 'a,b,c\n1,2,3', ','],
    ['punto y coma', 'a;b;c\n1;2;3', ';'],
    ['tabulación', 'a\tb\tc\n1\t2\t3', '\t'],
    ['barra vertical', 'a|b|c\n1|2|3', '|']
  ])('%s', (_nombre, texto, esperado) => {
    expect(detectarSeparador(texto)).toBe(esperado);
  });

  test('una coma dentro de comillas no cuenta como separador', () => {
    expect(detectarSeparador('nombre;nota\n"Pérez, Ana";12,5\n"Ruiz, Luis";14,0')).toBe(';');
  });
});

describe('Números: regla propia por columna, sin cambiar magnitudes en silencio', () => {
  test('punto y coma + coma decimal: "25,5" es 25.5 (antes 255) y la media de 25,5 y 31,2 es 28,35', () => {
    const ruta = escribir('excel-es.csv', Buffer.from(CSV_EXCEL_ES, 'utf8'));
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(ruta);

    expect(filas.map((f) => f.Temperatura)).toEqual([25.5, 31.2]);
    expect(mediaDe(columnas, filas, 'Temperatura')).toBeCloseTo(28.35, 10);
    expect(lectura).toMatchObject({ separador: ';', convencionDecimal: 'coma decimal', avisos: [] });
  });

  test('coma + punto decimal: "25.5" es 25.5 y la media es la misma', () => {
    const ruta = escribir('punto.csv', Buffer.from('ciudad,temperatura\nLima,25.5\nCusco,31.2', 'utf8'));
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(ruta);

    expect(filas.map((f) => f.temperatura)).toEqual([25.5, 31.2]);
    expect(mediaDe(columnas, filas, 'temperatura')).toBeCloseTo(28.35, 10);
    expect(lectura).toMatchObject({ separador: ',', convencionDecimal: 'punto decimal' });
  });

  test('miles en convención española ("1.234.567") y en inglesa ("1,234.56", entre comillas en un CSV con coma)', () => {
    const espanol = new LectorDatasetGenerico().leerArchivo(escribir('miles-es.csv', Buffer.from(CSV_EXCEL_ES, 'utf8')));
    expect(espanol.filas.map((f) => f['Población'])).toEqual([1234567, 208237]);

    const ingles = new LectorDatasetGenerico().leerArchivo(
      escribir('miles-en.csv', Buffer.from('item,amount\nA,"1,234.56"\nB,"12,000.5"\nC,99.9', 'utf8'))
    );
    expect(ingles.filas.map((f) => f.amount)).toEqual([1234.56, 12000.5, 99.9]);
    expect(ingles.lectura?.avisos).toEqual([]);
  });

  test('columna ambigua (todos sus valores son del tipo "1,234"): queda como texto y se avisa cuál y por qué', () => {
    const { filas, informacion } = leerTextoDelimitado(Buffer.from('codigo;monto\nA;1,234\nB;5,678', 'utf8'));

    expect(filas.map((f) => f.monto)).toEqual(['1,234', '5,678']);
    expect(informacion.avisos).toHaveLength(1);
    expect(informacion.avisos[0]).toMatch(/^La columna "monto" quedó como texto: .*"1,234".*para no cambiar su magnitud/);
  });

  test('si otro valor de la columna desempata, no hay ambigüedad ("1,234" junto a "2,5" → coma decimal)', () => {
    expect(decidirReglaDeColumna(['1,234', '2,5'])).toEqual({ regla: 'coma decimal' });
    expect(decidirReglaDeColumna(['1,234', '2.5'])).toEqual({ regla: 'punto decimal' });
    expect(decidirReglaDeColumna(['12', '7'])).toEqual({ regla: 'entero' });
    // Menos de la mayoría parece número: columna de texto, cada celda se decide sola.
    expect(decidirReglaDeColumna(['12.5', 'n/d'])).toEqual({ regla: 'por celda' });
  });

  test('una celda vacía no decide nada y llega como el valor vacío pedido', () => {
    const { filas } = leerTextoDelimitado(Buffer.from('a;b\n1,5;x\n;y', 'utf8'), { valorVacio: null });
    expect(filas).toEqual([{ a: 1.5, b: 'x' }, { a: null, b: 'y' }]);
  });
});

describe('Lo que no cambia', () => {
  test('.xlsx sigue por SheetJS, sin información de lectura de texto', () => {
    const ruta = path.join(carpeta, 'planilla.xlsx');
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Región', 'Temperatura'], ['Huánuco', 25.5]]), 'Hoja1');
    XLSX.writeFile(libro, ruta);

    const resultado = new LectorDatasetGenerico().leerArchivo(ruta);
    expect(resultado.filas).toEqual([{ 'Región': 'Huánuco', Temperatura: 25.5 }]);
    expect(resultado.lectura).toBeUndefined();
  });

  test('.tsv: siempre tabulación, aunque los valores tengan comas', () => {
    const ruta = escribir('datos.tsv', Buffer.from('nombre\tnota\nPérez, Ana\t12,5\nRuiz, Luis\t14,0', 'utf8'));
    const { filas, lectura } = new LectorDatasetGenerico().leerArchivo(ruta);
    expect(filas).toEqual([{ nombre: 'Pérez, Ana', nota: 12.5 }, { nombre: 'Ruiz, Luis', nota: 14 }]);
    expect(lectura?.separador).toBe('\t');
  });
});

describe('Lector del catálogo: la misma lectura, en memoria y por streaming', () => {
  // CVSS con coma decimal y "Sí" con tilde, en UTF-8 sin BOM: antes "Sí"
  // llegaba como "SÃ­" (fila rechazada) y "7,5" como 75 (fuera de rango).
  const CSV_CATALOGO = ['CVE;CVSS Score;Software;Acceso Remoto', 'CVE-2024-0001;7,5;Navegación;Sí', 'CVE-2024-0002;9,8;Señales;No'].join('\n');

  test('leerArchivo (.csv): CVSS 7.5 y 9.8, acceso remoto "Sí" reconocido, software con tildes', async () => {
    const ruta = escribir('catalogo.csv', Buffer.from(CSV_CATALOGO, 'utf8'));
    const { importables, rechazadas, lectura } = await new LectorExcelDataset().leerArchivo(ruta);

    expect(rechazadas).toEqual([]);
    expect(importables.map((i) => i.vulnerabilidad.cvssScore.valor)).toEqual([7.5, 9.8]);
    expect(importables.map((i) => i.vulnerabilidad.tipoAcceso?.valor)).toEqual(['Remoto', 'Local']);
    expect(importables.map((i) => i.vulnerabilidad.software)).toEqual(['Navegación', 'Señales']);
    expect(lectura).toMatchObject({ codificacion: 'UTF-8', separador: ';', convencionDecimal: 'coma decimal' });
  });

  test('detectarColumnas (.csv en Windows-1252): los nombres llegan con sus tildes', async () => {
    const ruta = escribir('columnas-ansi.csv', Buffer.from('Código;Puntuación\nA;1', 'latin1'));
    expect(await new LectorExcelDataset().detectarColumnas(ruta)).toEqual(['Código', 'Puntuación']);
  });

  test('leerArchivoCsvEnStreaming: mismo resultado y devuelve cómo se leyó', async () => {
    const ruta = escribir('catalogo-stream.csv', Buffer.from(CSV_CATALOGO, 'latin1'));
    const filas: FilaProcesada[] = [];
    const lectura = await new LectorExcelDataset().leerArchivoCsvEnStreaming(ruta, undefined, async (fila) => {
      filas.push(fila);
    });

    expect(filas.map((f) => f.tipo)).toEqual(['importable', 'importable']);
    const importables = filas.map((f) => (f.tipo === 'importable' ? f.dato.vulnerabilidad : null));
    expect(importables.map((v) => v?.cvssScore.valor)).toEqual([7.5, 9.8]);
    expect(importables.map((v) => v?.software)).toEqual(['Navegación', 'Señales']);
    expect(lectura).toMatchObject({ codificacion: 'Windows-1252', separador: ';', convencionDecimal: 'coma decimal' });
  });

  test('streaming de más filas que la muestra: un decimal que aparece después de la muestra se lee bien', async () => {
    const lineas = ['CVE;CVSS Score;Software;Acceso Remoto'];
    for (let i = 0; i < 1500; i++) lineas.push(`CVE-2024-${String(1000 + i)};${i < 1200 ? '5' : '6,5'};App;No`);
    const ruta = escribir('catalogo-largo.csv', Buffer.from(lineas.join('\n'), 'utf8'));

    const puntajes: number[] = [];
    await new LectorExcelDataset().leerArchivoCsvEnStreaming(ruta, undefined, async (fila) => {
      if (fila.tipo === 'importable') puntajes.push(fila.dato.vulnerabilidad.cvssScore.valor);
    });

    expect(puntajes).toHaveLength(1500);
    expect(puntajes[1199]).toBe(5);
    expect(puntajes[1200]).toBe(6.5);
  });
});
