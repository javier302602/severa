import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import {
  FILAS_DE_MUESTRA,
  abrirTextoDelimitadoEnStreaming,
  decidirReglaDeColumna,
  decodificarWindows1252,
  leerTextoDelimitado
} from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LecturaDeTextoDelimitado';
import { LectorDatasetGenerico } from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { LectorExcelDataset } from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LectorExcelDataset';
import { analizarDataset } from '../../../../../src/domain/services/data-cleaning/CalidadDeDatosGenerico';
import { calcularEstadisticasDescriptivas } from '../../../../../src/domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';

// Correcciones a la lectura de CSV después de la revisión del commit 4aff2eb:
// marcadores de faltante, Windows-1252 sin depender del runtime y datos que se
// perdían o cambiaban sin avisar (campos de más, ceros a la izquierda,
// notación científica). Con archivos reales, por los lectores reales.

let carpeta: string;
beforeAll(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-lectura-csv-2-'));
});
afterAll(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

function escribir(nombre: string, contenido: string | Buffer): string {
  const ruta = path.join(carpeta, nombre);
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

function columna(diagnostico: ReturnType<typeof analizarDataset>, nombre: string) {
  return diagnostico.columnas.find((c) => c.nombre === nombre)!;
}

function media(columnas: string[], filas: Array<Record<string, unknown>>, nombre: string, correcciones?: Record<string, string>) {
  const resumen = calcularEstadisticasDescriptivas(columnas, filas, correcciones as never).find((r) => r.nombre === nombre) as {
    tipo: string;
    media?: number;
  };
  return resumen;
}

describe('Marcadores de faltante (NA, N/A, NULL, -, ?)', () => {
  // El archivo de la revisión: con coma decimal, un solo "NA" dejaba la
  // columna entera como texto crudo ("peso" daba media 65 en vez de 72,25).
  const CON_COMA = ['id;ingreso;peso', '1;25,5;70,2', '2;NA;NA', '3;31,2;65', '4;28,4;80,5', '5;30,1;71,3', '6;27,9;NA', '7;29,5;68,8', '8;33,3;77,7'].join('\n');
  const CON_PUNTO = CON_COMA.replace(/;/g, '|').replace(/,/g, '.').replace(/\|/g, ',');

  test('no deciden la regla: "ingreso" y "peso" se leen con coma decimal y los "NA" quedan como están', () => {
    const { filas, lectura } = new LectorDatasetGenerico().leerArchivo(escribir('faltantes.csv', CON_COMA));

    expect(filas.map((f) => f.ingreso)).toEqual([25.5, 'NA', 31.2, 28.4, 30.1, 27.9, 29.5, 33.3]);
    expect(filas.map((f) => f.peso)).toEqual([70.2, 'NA', 65, 80.5, 71.3, 'NA', 68.8, 77.7]);
    expect(lectura).toMatchObject({ convencionDecimal: 'coma decimal', avisos: [] });
  });

  test('hasta las estadísticas: "ingreso" numérica con 1 faltante; "peso" con 2 faltantes y media 72,25', () => {
    const { columnas, filas } = new LectorDatasetGenerico().leerArchivo(escribir('faltantes-stats.csv', CON_COMA));
    const diagnostico = analizarDataset(columnas, filas);

    expect(columna(diagnostico, 'ingreso')).toMatchObject({ tipo: 'numerica', valoresFaltantes: 1, valoresInconsistentes: 0 });
    expect(media(columnas, filas, 'ingreso').media).toBeCloseTo((25.5 + 31.2 + 28.4 + 30.1 + 27.9 + 29.5 + 33.3) / 7, 10);

    expect(columna(diagnostico, 'peso')).toMatchObject({ valoresFaltantes: 2, valoresInconsistentes: 0 });
    // 6 números en 8 valores no vacíos queda bajo el 80 % de mayoría del
    // detector (los "NA" cuentan en su denominador, decisión documentada en
    // CalidadDeDatosGenerico.ts): con punto decimal pasa exactamente lo mismo.
    // Con el tipo corregido a numérica, la media es la correcta.
    const pesoCorregido = media(columnas, filas, 'peso', { peso: 'numerica_continua' });
    expect(pesoCorregido.tipo).toBe('numerica');
    expect(pesoCorregido.media).toBeCloseTo(72.25, 10);
  });

  test('el archivo con coma decimal da los mismos tipos, faltantes y medias que el mismo con punto decimal', () => {
    const lector = new LectorDatasetGenerico();
    const coma = lector.leerArchivo(escribir('coma.csv', CON_COMA));
    const punto = lector.leerArchivo(escribir('punto.csv', CON_PUNTO));
    const resumir = (l: typeof coma) =>
      analizarDataset(l.columnas, l.filas).columnas.map((c) => [c.nombre, c.tipoDetallado, c.valoresFaltantes, c.valoresInconsistentes]);

    expect(resumir(coma)).toEqual(resumir(punto));
    expect(media(coma.columnas, coma.filas, 'peso', { peso: 'numerica_continua' }).media).toBe(
      media(punto.columnas, punto.filas, 'peso', { peso: 'numerica_continua' }).media
    );
  });

  test('en una columna numérica, una celda que no es número queda como texto y se cuenta como inconsistente', () => {
    // "1,250" sola es ambigua (¿mil doscientos cincuenta o uno coma veinticinco?):
    // la decide la convención de su columna, que es coma decimal aunque haya
    // un "abc" y un "NA".
    const montos = ['10,5', 'abc', '12,5', '11', '13,25', 'NA', '9,75', '1,250', '10', '12,25'];
    const csv = ['id;monto', ...montos.map((m, i) => `${i + 1};${m}`)].join('\n');
    const { columnas, filas } = new LectorDatasetGenerico().leerArchivo(escribir('inconsistente.csv', csv));

    expect(filas.map((f) => f.monto)).toEqual([10.5, 'abc', 12.5, 11, 13.25, 'NA', 9.75, 1.25, 10, 12.25]);
    expect(columna(analizarDataset(columnas, filas), 'monto')).toMatchObject({ tipo: 'numerica', valoresFaltantes: 1, valoresInconsistentes: 1 });
  });

  test('todos los marcadores que reconoce el dominio quedan fuera de la decisión', () => {
    expect(decidirReglaDeColumna(['1,5', 'NA', 'n/a', 'NULL', '-', '?', '2,5'])).toEqual({ regla: 'coma decimal' });
  });
});

describe('Windows-1252 sin depender del runtime', () => {
  test('0x80–0x9F con la tabla propia: comillas tipográficas, €, guiones, Š, Ÿ', () => {
    expect(decodificarWindows1252(Buffer.from([0x93, 0x41, 0x94, 0x20, 0x80, 0x96, 0x8a, 0x9f]))).toBe('“A” €–ŠŸ');
  });

  test('un archivo "ANSI" con comillas tipográficas y € se lee completo', () => {
    const bytes = Buffer.concat([
      Buffer.from('Región;Nota\nHuánuco;', 'latin1'),
      Buffer.from([0x93]),
      Buffer.from('ok', 'latin1'),
      Buffer.from([0x94, 0x20, 0x80]),
      Buffer.from('\n', 'latin1')
    ]);
    const { filas, informacion } = leerTextoDelimitado(bytes);
    expect(informacion.codificacion).toBe('Windows-1252');
    expect(filas).toEqual([{ 'Región': 'Huánuco', Nota: '“ok” €' }]);
  });
});

describe('Nada se pierde ni cambia sin avisar', () => {
  test('filas con más campos que el encabezado: se avisa cuántas y los campos de más se conservan', () => {
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(escribir('de-mas.csv', 'a;b\n1;2\n3;4;5\n6;7;8;9\n'));

    expect(columnas).toEqual(['a', 'b', 'campo extra 1', 'campo extra 2']);
    expect(filas).toEqual([
      { a: 1, b: 2, 'campo extra 1': null, 'campo extra 2': null },
      { a: 3, b: 4, 'campo extra 1': 5, 'campo extra 2': null },
      { a: 6, b: 7, 'campo extra 1': 8, 'campo extra 2': 9 }
    ]);
    expect(lectura?.avisos[0]).toMatch(/^2 fila\(s\) tienen más campos que el encabezado \(la primera es la fila 3 del archivo\)/);
    expect(lectura?.avisos[0]).toContain('"campo extra 1", "campo extra 2"');
  });

  test('un separador de más al final de la línea (campos vacíos) no es un dato: sin aviso ni columnas nuevas', () => {
    const { columnas, informacion } = leerTextoDelimitado(Buffer.from('a;b\n1;2;\n3;4;\n'));
    expect(columnas).toEqual(['a', 'b']);
    expect(informacion.avisos).toEqual([]);
  });

  test('un CSV de una sola columna con coma decimal: "12,5" es 12,5 (antes 12)', () => {
    const { filas, lectura } = new LectorDatasetGenerico().leerArchivo(escribir('una-columna.csv', 'valor\n12,5\n7,25\n3\n'));

    expect(filas.map((f) => f.valor)).toEqual([12.5, 7.25, 3]);
    expect(lectura).toMatchObject({ separador: null, convencionDecimal: 'coma decimal', avisos: [] });
  });

  test('ceros a la izquierda: la columna es de códigos y queda como texto ("07001", "00123")', () => {
    const { filas } = new LectorDatasetGenerico().leerArchivo(escribir('ubigeo.csv', 'ubigeo;habitantes\n07001;1200\n00123;350\n150101;9800\n'));

    expect(filas.map((f) => f.ubigeo)).toEqual(['07001', '00123', '150101']);
    expect(filas.map((f) => f.habitantes)).toEqual([1200, 350, 9800]);
  });

  test('hasta las estadísticas: los códigos no se detectan como número ni pierden sus ceros', () => {
    const csv = ['ubigeo;habitantes', '07001;1200', '00123;350', '150101;9800', '080101;410', '150102;733'].join('\n');
    const { columnas, filas } = new LectorDatasetGenerico().leerArchivo(escribir('ubigeo-stats.csv', csv));
    const diagnostico = analizarDataset(columnas, filas);

    expect(columna(diagnostico, 'ubigeo').tipo).toBe('texto');
    expect(columna(diagnostico, 'habitantes').tipo).toBe('numerica');
    const ubigeo = calcularEstadisticasDescriptivas(columnas, filas).find((r) => r.nombre === 'ubigeo') as { media?: number };
    expect(ubigeo.media).toBeUndefined();
  });

  test('hasta las estadísticas: una columna ambigua avisada no se calcula como si tuviera punto decimal', () => {
    const csv = ['distrito;poblacion', 'Huánuco;196.627', 'Ñuñoa;208.237', 'Cañete;240.013'].join('\n');
    const { columnas, filas, lectura } = new LectorDatasetGenerico().leerArchivo(escribir('ambigua-stats.csv', csv));

    expect(lectura?.avisos).toEqual([expect.stringMatching(/^La columna "poblacion" quedó como texto/)]);
    expect(columna(analizarDataset(columnas, filas), 'poblacion').tipo).not.toBe('numerica');
    const poblacion = calcularEstadisticasDescriptivas(columnas, filas).find((r) => r.nombre === 'poblacion') as { media?: number };
    expect(poblacion.media).toBeUndefined();
  });

  test('notación científica con punto decimal y con coma decimal', () => {
    const punto = leerTextoDelimitado(Buffer.from('x,y\n1e-05,a\n2.5E-3,b\n3.1,c\n')).filas.map((f) => f.x);
    const coma = leerTextoDelimitado(Buffer.from('x;y\n1e-05;a\n2,5e-3;b\n3,1;c\n')).filas.map((f) => f.x);

    expect(punto).toEqual([0.00001, 0.0025, 3.1]);
    expect(coma).toEqual([0.00001, 0.0025, 3.1]);
  });

  test('una columna que mezcla las dos convenciones se lee con la de la mayoría y se avisa', () => {
    const { filas, informacion } = leerTextoDelimitado(Buffer.from('x;y\n1,5;a\n2,5;b\n3.5;c\n4,25;d\n5,5;e\n'));

    expect(filas.map((f) => f.x)).toEqual([1.5, 2.5, '3.5', 4.25, 5.5]);
    expect(informacion.avisos).toEqual([expect.stringMatching(/^La columna "x" se leyó con coma decimal: mezcla coma y punto decimal\..*1 valor\(es\) con punto decimal \(por ejemplo "3\.5"\)/)]);
  });

  test('streaming: un código con ceros que aparece después de la muestra no pierde sus ceros', async () => {
    const lineas = ['id;codigo'];
    for (let i = 0; i < FILAS_DE_MUESTRA + 100; i++) lineas.push(`${i};${i < FILAS_DE_MUESTRA ? 100 + i : '0' + i}`);
    const lectura = await abrirTextoDelimitadoEnStreaming(escribir('codigos-stream.csv', lineas.join('\n')));

    const codigos: unknown[] = [];
    for await (const fila of lectura.filas) codigos.push(fila.codigo);
    expect(codigos[0]).toBe(100);
    expect(codigos[FILAS_DE_MUESTRA]).toBe(`0${FILAS_DE_MUESTRA}`);
  });

  test('streaming del catálogo: filas con campos de más se avisan al terminar', async () => {
    const ruta = escribir('catalogo-de-mas.csv', 'CVE;CVSS Score;Software;Acceso Remoto\nCVE-2024-0001;7,5;App;Sí;sobra\nCVE-2024-0002;5;App;No\n');
    const lectura = await new LectorExcelDataset().leerArchivoCsvEnStreaming(ruta, undefined, async () => {});
    expect(lectura.avisos).toEqual([expect.stringMatching(/^1 fila\(s\) tienen más campos que el encabezado \(la primera es la fila 2 del archivo\)/)]);
  });
});

// Diferencial: para CSV simples en inglés (coma, punto decimal, sin miles ni
// ceros a la izquierda), el lector nuevo tiene que dar exactamente lo mismo
// que XLSX.readFile —valores y tipos detectados—, también con "NA".
describe('Diferencial contra XLSX.readFile en CSV simples en inglés', () => {
  const ARCHIVOS: Record<string, string> = {
    'numeros-y-texto': ['id,city,score,ratio', '1,Lima,25.5,0.5', '2,Cusco,31.2,.25', '3,Arequipa,-28.4,1e-05', '4,Lima,30,3E+2'].join('\n'),
    'con-na': ['id,ingreso,peso,nota', '1,25.5,70.2,A', '2,NA,NA,B', '3,31.2,65,NA', '4,28.4,80.5,A', '5,30.1,71.3,N/A', '6,27.9,NA,B', '7,29.5,68.8,null', '8,33.3,77.7,A'].join('\n'),
    'vacios-y-comillas': ['name,amount,comment', '"Smith, J",10.5,"said ""hi"""', 'Doe,,ok', ',7,', 'Roe,8.25,"a, b"'].join('\n'),
    'marcadores': ['a,b', '1,-', '2,?', '3,NULL', '4,n/a', '5,7'].join('\n')
  };

  test.each(Object.keys(ARCHIVOS))('%s', (nombre) => {
    const ruta = escribir(`${nombre}.csv`, ARCHIVOS[nombre]);

    const libro = XLSX.readFile(ruta, { cellDates: true });
    const antes = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: null }) as Array<Record<string, unknown>>;
    const ahora = new LectorDatasetGenerico().leerArchivo(ruta);

    expect(ahora.filas).toEqual(antes);
    const tipos = (filas: Array<Record<string, unknown>>) =>
      analizarDataset(Object.keys(filas[0]), filas).columnas.map((c) => [c.nombre, c.tipoDetallado, c.valoresFaltantes, c.valoresInconsistentes]);
    expect(tipos(ahora.filas)).toEqual(tipos(antes));
  });
});
