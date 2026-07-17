import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';

jest.mock('../../src/infrastructure/config/container', () => ({
  container: {
    importarDatasetDesdeArchivoUseCase: {
      ejecutar: jest.fn().mockResolvedValue({ importados: 2, rechazados: 0, errores: [] })
    },
    detectarColumnasDatasetUseCase: {
      ejecutar: jest.fn().mockResolvedValue(['ID', 'CVE', 'Software', 'CVSS Score', 'Acceso Remoto'])
    },
    exportarDatasetValidadoUseCase: {
      ejecutar: jest.fn().mockResolvedValue('CVE-2024-00001,9.8,Apache Log4j')
    },
    importarDatasetDesdeUrlUseCase: {
      ejecutar: jest.fn()
    }
  }
}));

import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';
import { container } from '../../src/infrastructure/config/container';

const app = createApp();

function tokenPara(id: string): string {
  return jwt.sign({ sub: id, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function crearXlsxDePrueba(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-dataset-controller-'));
  const filePath = path.join(tempDir, 'dataset.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['ID', 'CVE', 'Software', 'CVSS Score', 'Acceso Remoto'],
    [1, 'CVE-2024-00001', 'Apache Log4j', 9.8, 'Sí']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('DatasetController — RF-17/RF-24 (Sprint 14)', () => {
  const token = tokenPara('analista-A');

  test('POST /dataset/importar con un .xlsx válido invoca importarDatasetDesdeArchivoUseCase con el analista del token y responde 201', async () => {
    const filePath = crearXlsxDePrueba();

    const res = await conHttps(
      request(app).post('/dataset/importar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ importados: 2, rechazados: 0, errores: [] });
    expect(container.importarDatasetDesdeArchivoUseCase.ejecutar).toHaveBeenCalledWith(
      expect.any(String),
      'analista-A',
      undefined,
      'dataset.xlsx'
    );
  });

  describe('mapeo flexible de columnas', () => {
    afterEach(() => {
      (container.importarDatasetDesdeArchivoUseCase.ejecutar as jest.Mock).mockClear();
    });

    test('POST /dataset/columnas devuelve las columnas detectadas por el caso de uso', async () => {
      const filePath = crearXlsxDePrueba();

      const res = await conHttps(
        request(app).post('/dataset/columnas').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ columnas: ['ID', 'CVE', 'Software', 'CVSS Score', 'Acceso Remoto'] });
      expect(container.detectarColumnasDatasetUseCase.ejecutar).toHaveBeenCalledWith(expect.any(String));
    });

    test('POST /dataset/columnas sin archivo devuelve 400', async () => {
      const res = await conHttps(request(app).post('/dataset/columnas').set('Authorization', `Bearer ${token}`));
      expect(res.status).toBe(400);
    });

    test('POST /dataset/importar con un mapeoColumnas válido lo parsea y lo pasa al caso de uso', async () => {
      const filePath = crearXlsxDePrueba();
      const mapeo = { cve: 'Identificador', cvssScore: 'Puntaje CVSS' };

      const res = await conHttps(
        request(app)
          .post('/dataset/importar')
          .set('Authorization', `Bearer ${token}`)
          .field('mapeoColumnas', JSON.stringify(mapeo))
          .attach('archivo', filePath)
      );

      expect(res.status).toBe(201);
      expect(container.importarDatasetDesdeArchivoUseCase.ejecutar).toHaveBeenCalledWith(
        expect.any(String),
        'analista-A',
        mapeo,
        'dataset.xlsx'
      );
    });

    test('POST /dataset/importar ignora claves desconocidas y valores vacíos del mapeo', async () => {
      const filePath = crearXlsxDePrueba();

      const res = await conHttps(
        request(app)
          .post('/dataset/importar')
          .set('Authorization', `Bearer ${token}`)
          .field('mapeoColumnas', JSON.stringify({ cve: 'Identificador', claveInventada: 'x', software: '' }))
          .attach('archivo', filePath)
      );

      expect(res.status).toBe(201);
      expect(container.importarDatasetDesdeArchivoUseCase.ejecutar).toHaveBeenCalledWith(
        expect.any(String),
        'analista-A',
        { cve: 'Identificador' },
        'dataset.xlsx'
      );
    });

    test('POST /dataset/importar con un mapeoColumnas que no es JSON válido devuelve 400', async () => {
      const filePath = crearXlsxDePrueba();

      const res = await conHttps(
        request(app)
          .post('/dataset/importar')
          .set('Authorization', `Bearer ${token}`)
          .field('mapeoColumnas', '{esto no es json')
          .attach('archivo', filePath)
      );

      expect(res.status).toBe(400);
      expect(container.importarDatasetDesdeArchivoUseCase.ejecutar).not.toHaveBeenCalled();
    });
  });

  test('POST /dataset/importar sin archivo devuelve 400', async () => {
    const res = await conHttps(request(app).post('/dataset/importar').set('Authorization', `Bearer ${token}`));
    expect(res.status).toBe(400);
  });

  test('POST /dataset/importar con un archivo que no es Excel es rechazado (defensa en profundidad)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-dataset-controller-'));
    const filePath = path.join(tempDir, 'no-es-excel.txt');
    fs.writeFileSync(filePath, 'esto no es un dataset');

    const res = await conHttps(
      request(app).post('/dataset/importar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(400);
  });

  test('GET /dataset/exportar devuelve el CSV del dataset validado', async () => {
    const res = await conHttps(request(app).get('/dataset/exportar').set('Authorization', `Bearer ${token}`));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toBe('CVE-2024-00001,9.8,Apache Log4j');
  });

  describe('POST /dataset/importar-url (Sprint 17)', () => {
    beforeEach(() => {
      (container.importarDatasetDesdeUrlUseCase.ejecutar as jest.Mock).mockReset();
    });

    test('con una url válida invoca importarDatasetDesdeUrlUseCase con el analista del token y responde 201', async () => {
      (container.importarDatasetDesdeUrlUseCase.ejecutar as jest.Mock).mockResolvedValue({
        importados: 5,
        rechazados: 0,
        errores: []
      });

      const res = await conHttps(
        request(app)
          .post('/dataset/importar-url')
          .set('Authorization', `Bearer ${token}`)
          .send({ url: 'https://docs.google.com/spreadsheets/d/ID123/edit' })
      );

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ importados: 5, rechazados: 0, errores: [] });
      expect(container.importarDatasetDesdeUrlUseCase.ejecutar).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/ID123/edit',
        'analista-A'
      );
    });

    test('sin "url" en el body devuelve 400 sin invocar el caso de uso', async () => {
      const res = await conHttps(
        request(app).post('/dataset/importar-url').set('Authorization', `Bearer ${token}`).send({})
      );

      expect(res.status).toBe(400);
      expect(container.importarDatasetDesdeUrlUseCase.ejecutar).not.toHaveBeenCalled();
    });

    test('cuando el caso de uso rechaza (host/IP no permitido) responde 400 con el mensaje claro, no 500', async () => {
      (container.importarDatasetDesdeUrlUseCase.ejecutar as jest.Mock).mockRejectedValue(
        new Error('Dominio no permitido: evil.example.com')
      );

      const res = await conHttps(
        request(app)
          .post('/dataset/importar-url')
          .set('Authorization', `Bearer ${token}`)
          .send({ url: 'https://evil.example.com/malware.xlsx' })
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Dominio no permitido: evil.example.com');
    });
  });
});
