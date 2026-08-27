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

  describe('mapeo automático de columnas/valores (dataset real de Kaggle CVE+CISA+EPSS, 2026-07-18)', () => {
    test('reconoce cve_id/base_score/attack_vector SIN mapeo manual, y traduce NETWORK/LOCAL a Sí/No', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
      const filePath = path.join(tempDir, 'dataset-kaggle.xlsx');

      const ws = XLSX.utils.aoa_to_sheet([
        ['cve_id', 'base_severity', 'base_score', 'attack_vector'],
        ['CVE-1999-0095', 'HIGH', 10.0, 'NETWORK'],
        ['CVE-1999-0082', 'HIGH', 10.0, 'LOCAL'],
        ['CVE-1999-1234', 'MEDIUM', 5.0, 'ADJACENT_NETWORK']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);

      const lector = new LectorExcelDataset();
      const resultado = await lector.leerArchivo(filePath);

      expect(resultado.rechazadas).toHaveLength(0);
      expect(resultado.importables).toHaveLength(3);
      expect(resultado.importables[0].vulnerabilidad.tipoAcceso?.valor).toBe('Remoto'); // NETWORK
      expect(resultado.importables[1].vulnerabilidad.tipoAcceso?.valor).toBe('Local'); // LOCAL
      expect(resultado.importables[2].vulnerabilidad.tipoAcceso?.valor).toBe('Remoto'); // ADJACENT_NETWORK
    });

    test('el mapeo manual explícito sigue teniendo prioridad sobre el auto-detectado', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-'));
      const filePath = path.join(tempDir, 'dataset-ambiguo.xlsx');

      // Trae AMBAS: la columna que se auto-detectaría (cve_id) y una columna
      // custom con el mismo dato — el mapeo manual gana igual.
      const ws = XLSX.utils.aoa_to_sheet([
        ['cve_id', 'Identificador Real', 'base_score', 'attack_vector'],
        ['CVE-9999-9999', 'CVE-2024-00001', 9.8, 'NETWORK']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);

      const lector = new LectorExcelDataset();
      const resultado = await lector.leerArchivo(filePath, { cve: 'Identificador Real' });

      expect(resultado.importables[0].vulnerabilidad.cve.valor).toBe('CVE-2024-00001');
    });
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

  // Streaming real de CSV (2026-07-17, datasets públicos de cientos de MB
  // vía "importar desde link") — a diferencia de leerArchivo (.xlsx, todo en
  // memoria), este método lee con csv-parse en modo stream y entrega cada
  // fila ya clasificada por callback, sin acumular un array completo.
  describe('leerArchivoCsvEnStreaming', () => {
    function escribirCsv(contenido: string): string {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-csv-'));
      const filePath = path.join(tempDir, 'dataset.csv');
      fs.writeFileSync(filePath, contenido);
      return filePath;
    }

    test('separa importados y rechazados fila por fila, igual que leerArchivo con .xlsx', async () => {
      const filePath = escribirCsv(
        'CVE,Software,CVSS Score,Acceso Remoto\n' +
          'CVE-2024-00001,Apache Log4j,10,Sí\n' +
          'CVE-26-1,Dummy,11,No\n' +
          'CVE-2024-00003,OpenSSL,7.8,Sí\n'
      );

      const lector = new LectorExcelDataset();
      const importables: string[] = [];
      const rechazadas: string[] = [];

      await lector.leerArchivoCsvEnStreaming(filePath, undefined, async (fila) => {
        if (fila.tipo === 'importable') {
          importables.push(fila.dato.vulnerabilidad.cve.valor);
        } else {
          rechazadas.push(fila.dato.error);
        }
      });

      expect(importables).toEqual(['CVE-2024-00001', 'CVE-2024-00003']);
      expect(rechazadas).toHaveLength(1);
      expect(rechazadas[0]).toContain('CVE');
    });

    test('rechaza un CSV sin las columnas obligatorias con EstructuraColumnasInvalidaError', async () => {
      const filePath = escribirCsv('Identificador,Puntaje\nCVE-2024-00001,9.8\n');
      const lector = new LectorExcelDataset();

      await expect(lector.leerArchivoCsvEnStreaming(filePath, undefined, async () => {})).rejects.toThrow(
        EstructuraColumnasInvalidaError
      );
    });

    test('rechaza un CSV sin filas de datos con DatasetInvalidoError', async () => {
      const filePath = escribirCsv('CVE,Software,CVSS Score,Acceso Remoto\n');
      const lector = new LectorExcelDataset();

      await expect(lector.leerArchivoCsvEnStreaming(filePath, undefined, async () => {})).rejects.toThrow(
        DatasetInvalidoError
      );
    });

    test('respeta el mapeo flexible de columnas, igual que leerArchivo', async () => {
      const filePath = escribirCsv('Identificador,Puntaje CVSS,Remoto?\nCVE-2024-00001,9.8,Sí\n');
      const lector = new LectorExcelDataset();
      const importables: string[] = [];

      await lector.leerArchivoCsvEnStreaming(
        filePath,
        { cve: 'Identificador', cvssScore: 'Puntaje CVSS', accesoRemoto: 'Remoto?' },
        async (fila) => {
          if (fila.tipo === 'importable') importables.push(fila.dato.vulnerabilidad.cve.valor);
        }
      );

      expect(importables).toEqual(['CVE-2024-00001']);
    });

    // Verificación de streaming/batching real a escala (punto 7 del pedido):
    // archivo sintético de varias decenas de MB, generado acá mismo (no
    // depende de internet) — prueba que leerArchivoCsvEnStreaming procesa un
    // archivo grande de punta a punta sin perder ni duplicar filas. La
    // verificación con el archivo REAL de ~400MB es manual, en vivo (ver
    // informe), esto es la cobertura automatizada a una escala menor.
    test('procesa un CSV sintético de varias decenas de MB (cientos de miles de filas) sin perder ni duplicar ninguna', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-csv-grande-'));
      const filePath = path.join(tempDir, 'dataset-grande.csv');
      const TOTAL_FILAS = 500_000; // ~45 bytes/fila => ~22MB

      const flujo = fs.createWriteStream(filePath);
      flujo.write('CVE,Software,CVSS Score,Acceso Remoto\n');
      for (let i = 0; i < TOTAL_FILAS; i++) {
        flujo.write(`CVE-2030-${100000 + i},Software-Ejemplo,7.8,Sí\n`);
      }
      await new Promise<void>((resolve, reject) => {
        flujo.end((error?: Error | null) => (error ? reject(error) : resolve()));
      });

      const tamanoBytes = fs.statSync(filePath).size;
      expect(tamanoBytes).toBeGreaterThan(10 * 1024 * 1024); // confirma que de verdad son "decenas de MB"

      const lector = new LectorExcelDataset();
      let importados = 0;
      let rechazados = 0;
      const cvesVistos = new Set<string>();

      await lector.leerArchivoCsvEnStreaming(filePath, undefined, async (fila) => {
        if (fila.tipo === 'importable') {
          importados++;
          cvesVistos.add(fila.dato.vulnerabilidad.cve.valor);
        } else {
          rechazados++;
        }
      });

      expect(importados).toBe(TOTAL_FILAS);
      expect(rechazados).toBe(0);
      expect(cvesVistos.size).toBe(TOTAL_FILAS); // ninguna fila duplicada

      fs.unlinkSync(filePath);
    }, 60_000);
  });
});
