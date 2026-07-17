import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { LectorDatasetGenerico } from '../../src/infrastructure/adapters/out/dataset-generico/LectorDatasetGenerico';
import { DatasetInvalidoError } from '../../src/domain/errors/DatasetInvalidoError';

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
});
