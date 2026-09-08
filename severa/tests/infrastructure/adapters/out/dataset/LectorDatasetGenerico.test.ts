import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { LectorDatasetGenerico } from '../../../../../src/infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { DatasetInvalidoError } from '../../../../../src/domain/errors/DatasetInvalidoError';

describe('LectorDatasetGenerico', () => {
  test('lee columnas y filas tal cual vienen, sin asumir ningún nombre de columna fijo', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-'));
    const filePath = path.join(tempDir, 'ventas.xlsx');

    const ws = XLSX.utils.aoa_to_sheet([
      ['Producto', 'Precio', 'Cantidad'],
      ['Laptop', 1200, 3],
      ['Mouse', 25, 10]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    const lector = new LectorDatasetGenerico();
    const resultado = lector.leerArchivo(filePath);

    expect(resultado.columnas).toEqual(['Producto', 'Precio', 'Cantidad']);
    expect(resultado.filas).toHaveLength(2);
    expect(resultado.filas[0]).toEqual({ Producto: 'Laptop', Precio: 1200, Cantidad: 3 });
  });

  test('una celda vacía llega como null, no como string vacío (a diferencia de LectorExcelDataset)', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-'));
    const filePath = path.join(tempDir, 'con-vacios.xlsx');

    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Edad'],
      ['Ana', 25],
      ['Beto', null]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    const lector = new LectorDatasetGenerico();
    const resultado = lector.leerArchivo(filePath);

    expect(resultado.filas[1].Edad).toBeNull();
  });

  test('rechaza un archivo corrupto con DatasetInvalidoError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-'));
    const filePath = path.join(tempDir, 'corrupto.xlsx');
    fs.writeFileSync(filePath, 'esto no es un archivo válido');

    const lector = new LectorDatasetGenerico();

    expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
  });

  test('rechaza un archivo sin filas de datos con DatasetInvalidoError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-'));
    const filePath = path.join(tempDir, 'vacio.xlsx');

    const ws = XLSX.utils.aoa_to_sheet([['Producto', 'Precio']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    const lector = new LectorDatasetGenerico();

    expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
  });

  test('lee un CSV igual que un xlsx, sin lógica adicional', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-'));
    const filePath = path.join(tempDir, 'ventas.csv');
    fs.writeFileSync(filePath, 'Producto,Precio\nLaptop,1200\nMouse,25\n');

    const lector = new LectorDatasetGenerico();
    const resultado = lector.leerArchivo(filePath);

    expect(resultado.columnas).toEqual(['Producto', 'Precio']);
    expect(resultado.filas).toHaveLength(2);
  });

  // M-14 (RF-105): de punta a punta con un archivo .tsv REAL (tabs de
  // verdad escritos a disco) — no alcanza con que el filtro de multer del
  // controller deje pasar la extensión, hay que probar que SheetJS con
  // FS:'\t' explícito de verdad separa las columnas.
  describe('RF-105 — TSV', () => {
    test('lee un .tsv real (separado por tabs), reconociendo columnas y valores correctamente', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-tsv-'));
      const filePath = path.join(tempDir, 'ventas.tsv');
      fs.writeFileSync(filePath, 'Producto\tPrecio\tCantidad\nLaptop\t1200\t3\nMouse\t25\t10\n');

      const lector = new LectorDatasetGenerico();
      const resultado = lector.leerArchivo(filePath);

      expect(resultado.columnas).toEqual(['Producto', 'Precio', 'Cantidad']);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.filas[0]).toEqual({ Producto: 'Laptop', Precio: 1200, Cantidad: 3 });
      expect(resultado.filas[1]).toEqual({ Producto: 'Mouse', Precio: 25, Cantidad: 10 });
    });

    test('un valor con comas dentro no se parte por error (prueba de que de verdad separa por tab, no por coma)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-tsv-'));
      const filePath = path.join(tempDir, 'con-comas.tsv');
      fs.writeFileSync(filePath, 'Producto\tDescripcion\nLaptop\tPantalla, teclado y mouse incluidos\n');

      const lector = new LectorDatasetGenerico();
      const resultado = lector.leerArchivo(filePath);

      expect(resultado.columnas).toEqual(['Producto', 'Descripcion']);
      expect(resultado.filas[0].Descripcion).toBe('Pantalla, teclado y mouse incluidos');
    });

    test('rechaza un .tsv sin filas de datos con DatasetInvalidoError', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-tsv-'));
      const filePath = path.join(tempDir, 'vacio.tsv');
      fs.writeFileSync(filePath, 'Producto\tPrecio\n');

      const lector = new LectorDatasetGenerico();
      expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
    });
  });

  // M-14 (RF-105): JSON tabular no pasa por SheetJS en absoluto — de punta a
  // punta con un archivo .json REAL escrito a disco.
  describe('RF-105 — JSON tabular', () => {
    test('lee un .json real (array de objetos), derivando columnas de las claves de la primera fila', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-json-'));
      const filePath = path.join(tempDir, 'ventas.json');
      fs.writeFileSync(
        filePath,
        JSON.stringify([
          { Producto: 'Laptop', Precio: 1200, Cantidad: 3 },
          { Producto: 'Mouse', Precio: 25, Cantidad: 10 }
        ])
      );

      const lector = new LectorDatasetGenerico();
      const resultado = lector.leerArchivo(filePath);

      expect(resultado.columnas).toEqual(['Producto', 'Precio', 'Cantidad']);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.filas[0]).toEqual({ Producto: 'Laptop', Precio: 1200, Cantidad: 3 });
    });

    test('conserva tipos JSON nativos (número, booleano, null) sin coaccionarlos a string', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-json-'));
      const filePath = path.join(tempDir, 'tipos.json');
      fs.writeFileSync(filePath, JSON.stringify([{ activo: true, edad: 30, apodo: null }]));

      const lector = new LectorDatasetGenerico();
      const resultado = lector.leerArchivo(filePath);

      expect(resultado.filas[0]).toEqual({ activo: true, edad: 30, apodo: null });
    });

    test('rechaza un JSON que no es un array (ej. un objeto único) con DatasetInvalidoError', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-json-'));
      const filePath = path.join(tempDir, 'no-tabular.json');
      fs.writeFileSync(filePath, JSON.stringify({ Producto: 'Laptop', Precio: 1200 }));

      const lector = new LectorDatasetGenerico();
      expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
    });

    test('rechaza un array cuyos elementos no son objetos (ej. array de números)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-json-'));
      const filePath = path.join(tempDir, 'array-plano.json');
      fs.writeFileSync(filePath, JSON.stringify([1, 2, 3]));

      const lector = new LectorDatasetGenerico();
      expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
    });

    test('rechaza un array vacío con DatasetInvalidoError', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-json-'));
      const filePath = path.join(tempDir, 'vacio.json');
      fs.writeFileSync(filePath, '[]');

      const lector = new LectorDatasetGenerico();
      expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
    });

    test('rechaza un archivo .json con contenido que no es JSON válido', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-generico-json-'));
      const filePath = path.join(tempDir, 'malformado.json');
      fs.writeFileSync(filePath, '{ esto no es JSON válido');

      const lector = new LectorDatasetGenerico();
      expect(() => lector.leerArchivo(filePath)).toThrow(DatasetInvalidoError);
    });
  });
});
