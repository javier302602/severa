import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { LectorExcelDataset } from '../../src/infrastructure/adapters/out/dataset/LectorExcelDataset';
import { DatasetInvalidoError } from '../../src/domain/errors/DatasetInvalidoError';
import { EstructuraColumnasInvalidaError } from '../../src/domain/errors/EstructuraColumnasInvalidaError';

describe('LectorExcelDataset', () => {
  test('separa importados y rechazados cuando hay una fila inválida', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
    const filePath = path.join(tempDir, 'dataset.xlsx');

    const ws = XLSX.utils.aoa_to_sheet([
      ['ID', 'CVE', 'Software', 'CVSS Score', 'Severidad', 'Tipo de Vulnerabilidad', 'Acceso Remoto', 'Días para Parche'],
      [1, 'CVE-2024-00001', 'Apache Log4j', 10, 'Crítica', 'Code Injection', 'Sí', 1],
      [2, 'CVE-26-1', 'Dummy', 11, 'Alta', 'Buffer Overflow', 'No', 2],
      [3, 'CVE-2024-00003', 'OpenSSL', 7.8, 'Alta', 'Heap Overflow', 'Sí', 3]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    const lector = new LectorExcelDataset();
    const resultado = await lector.leerArchivo(filePath);

    expect(resultado.importables).toHaveLength(2);
    expect(resultado.rechazadas).toHaveLength(1);
    expect(resultado.rechazadas[0].error).toContain('CVE');
    expect(resultado.importables[0].vulnerabilidad.cve.valor).toBe('CVE-2024-00001');
  });

  // RF-97: verificación de integridad estructural antes de aceptar el archivo.
  test('rechaza un archivo corrupto/que no es un Excel real con DatasetInvalidoError', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
    const filePath = path.join(tempDir, 'corrupto.xlsx');
    fs.writeFileSync(filePath, 'esto no es un archivo xlsx, es texto plano');

    const lector = new LectorExcelDataset();

    await expect(lector.leerArchivo(filePath)).rejects.toThrow(DatasetInvalidoError);
  });

  test('rechaza un archivo Excel sin filas de datos con DatasetInvalidoError', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
    const filePath = path.join(tempDir, 'vacio.xlsx');

    const ws = XLSX.utils.aoa_to_sheet([['ID', 'CVE', 'Software', 'CVSS Score', 'Acceso Remoto']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    const lector = new LectorExcelDataset();

    await expect(lector.leerArchivo(filePath)).rejects.toThrow(DatasetInvalidoError);
  });

  describe('mapeo flexible de columnas', () => {
    test('con un mapeo explícito, lee las columnas con los nombres reales del archivo del usuario', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
      const filePath = path.join(tempDir, 'dataset-nombres-propios.xlsx');

      const ws = XLSX.utils.aoa_to_sheet([
        ['Identificador', 'Puntaje CVSS', 'Producto', 'Categoria', 'Remoto?', 'Plazo (dias)'],
        ['CVE-2024-00001', 9.8, 'Apache Log4j', 'Code Injection', 'Sí', 1]
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);

      const lector = new LectorExcelDataset();
      const resultado = await lector.leerArchivo(filePath, {
        cve: 'Identificador',
        cvssScore: 'Puntaje CVSS',
        software: 'Producto',
        tipoVulnerabilidad: 'Categoria',
        accesoRemoto: 'Remoto?',
        diasParaParche: 'Plazo (dias)'
      });

      expect(resultado.rechazadas).toHaveLength(0);
      expect(resultado.importables).toHaveLength(1);
      const vulnerabilidad = resultado.importables[0].vulnerabilidad;
      expect(vulnerabilidad.cve.valor).toBe('CVE-2024-00001');
      expect(vulnerabilidad.cvssScore.valor).toBe(9.8);
      expect(vulnerabilidad.software).toBe('Apache Log4j');
      expect(vulnerabilidad.tipoVulnerabilidad).toBe('Code Injection');
      expect(vulnerabilidad.diasParaParche).toBe(1);
    });

    test('sin mapeo, un archivo con nombres de columna no estándar sigue rechazándose por columnas faltantes (compatibilidad total)', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
      const filePath = path.join(tempDir, 'dataset-nombres-propios-sin-mapeo.xlsx');

      const ws = XLSX.utils.aoa_to_sheet([
        ['Identificador', 'Puntaje CVSS', 'Remoto?'],
        ['CVE-2024-00001', 9.8, 'Sí']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);

      const lector = new LectorExcelDataset();

      await expect(lector.leerArchivo(filePath)).rejects.toThrow(EstructuraColumnasInvalidaError);
    });

    test('un mapeo parcial (solo CVE) usa los nombres por defecto para el resto de los campos', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
      const filePath = path.join(tempDir, 'dataset-mapeo-parcial.xlsx');

      const ws = XLSX.utils.aoa_to_sheet([
        ['Identificador', 'CVSS Score', 'Acceso Remoto'],
        ['CVE-2024-00001', 9.8, 'Sí']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);

      const lector = new LectorExcelDataset();
      const resultado = await lector.leerArchivo(filePath, { cve: 'Identificador' });

      expect(resultado.importables).toHaveLength(1);
      expect(resultado.importables[0].vulnerabilidad.cve.valor).toBe('CVE-2024-00001');
    });
  });

  describe('detectarColumnas', () => {
    test('devuelve los nombres de columna del archivo, sin importar si coinciden con los esperados por SEVERA', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
      const filePath = path.join(tempDir, 'dataset-para-detectar.xlsx');

      const ws = XLSX.utils.aoa_to_sheet([
        ['Identificador', 'Puntaje CVSS', 'Producto'],
        ['CVE-2024-00001', 9.8, 'Apache Log4j']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);

      const lector = new LectorExcelDataset();
      const columnas = await lector.detectarColumnas(filePath);

      expect(columnas).toEqual(['Identificador', 'Puntaje CVSS', 'Producto']);
    });
  });

  test('rechaza un archivo Excel al que le faltan columnas obligatorias con EstructuraColumnasInvalidaError', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
    const filePath = path.join(tempDir, 'columnas-incompletas.xlsx');

    const ws = XLSX.utils.aoa_to_sheet([
      ['ID', 'Software'],
      [1, 'Apache Log4j']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    const lector = new LectorExcelDataset();

    await expect(lector.leerArchivo(filePath)).rejects.toThrow(EstructuraColumnasInvalidaError);
  });
});
