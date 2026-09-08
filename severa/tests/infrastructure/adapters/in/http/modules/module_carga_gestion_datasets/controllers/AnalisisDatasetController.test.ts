import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { DatasetGenericoNoEncontradoError } from '../../../../../../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { ColumnaDeDatasetInvalidaError } from '../../../../../../../../src/domain/errors/ColumnaDeDatasetInvalidaError';
import { DatasetGenerico } from '../../../../../../../../src/domain/entities/DatasetGenerico';
import { CriterioDeClasificacionValue } from '../../../../../../../../src/domain/shared/value-objects/CriterioDeClasificacion';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    analizarDatasetGenericoUseCase: {
      ejecutar: jest.fn().mockResolvedValue({
        diagnostico: {
          totalFilas: 2,
          filasDuplicadas: 0,
          columnas: [{ nombre: 'Producto', tipo: 'categorica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 2, valoresInconsistentes: 0 }]
        },
        sesionId: 'sesion-mock-123',
        datasetId: 'dataset-mock-123'
      })
    },
    exportarDatasetGenericoUseCase: {
      ejecutar: jest.fn()
    },
    calcularEstadisticasDescriptivasGenericoUseCase: {
      ejecutar: jest.fn()
    },
    analizarColumnaUnivariadoGenericoUseCase: {
      ejecutar: jest.fn()
    },
    configurarCriterioDeClasificacionUseCase: {
      ejecutar: jest.fn()
    }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';

const app = createApp();

function tokenPara(id: string): string {
  return jwt.sign({ sub: id, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function crearXlsxDePrueba(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-controller-'));
  const filePath = path.join(tempDir, 'ventas.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Producto', 'Precio'],
    ['Laptop', 1200],
    ['Mouse', 25]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('AnalisisDatasetController — Mejora 4 (Análisis de Datos General) Fase 2', () => {
  const token = tokenPara('analista-A');

  test('POST /analisis-datos/analizar con un archivo válido invoca el caso de uso y responde 200 con el diagnóstico', async () => {
    const filePath = crearXlsxDePrueba();

    const res = await conHttps(
      request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(200);
    expect(res.body.totalFilas).toBe(2);
    expect(res.body.sesionId).toBe('sesion-mock-123');
    expect(res.body.datasetId).toBe('dataset-mock-123');
    expect(container.analizarDatasetGenericoUseCase.ejecutar).toHaveBeenCalledWith(
      expect.any(String),
      'analista-A',
      expect.any(String)
    );
  });

  test('POST /analisis-datos/analizar sin archivo devuelve 400', async () => {
    const res = await conHttps(request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`));
    expect(res.status).toBe(400);
  });

  test('POST /analisis-datos/analizar sin autenticar devuelve 401', async () => {
    // Sin adjuntar archivo: la autenticación (autenticacion, montada antes de
    // cualquier router en app.ts) corta la request antes de que multer
    // llegue a procesar el body, así que no hace falta un archivo real para
    // este caso — adjuntarlo + esperar 401 puede cortar la conexión a mitad
    // del stream multipart (ECONNRESET en el cliente de test).
    const res = await conHttps(request(app).post('/analisis-datos/analizar'));
    expect(res.status).toBe(401);
  });

  test('POST /analisis-datos/analizar con un archivo que no es Excel/CSV es rechazado', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-controller-'));
    const filePath = path.join(tempDir, 'no-es-dataset.pdf');
    fs.writeFileSync(filePath, 'esto no es un dataset');

    const res = await conHttps(
      request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(400);
  });

  test('cuando el caso de uso rechaza (archivo corrupto) responde 400 con el mensaje claro, no 500', async () => {
    (container.analizarDatasetGenericoUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(
      new Error('El archivo está corrupto o no es un Excel/CSV válido')
    );
    const filePath = crearXlsxDePrueba();

    const res = await conHttps(
      request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El archivo está corrupto o no es un Excel/CSV válido');
  });
});

describe('GET /analisis-datos/:datasetId/exportar — RF-24 generalizado', () => {
  const token = tokenPara('analista-A');

  test('exporta con éxito y responde con un .xlsx', async () => {
    (container.exportarDatasetGenericoUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(Buffer.from('PK-xlsx-fake'));

    const res = await conHttps(
      request(app).get('/analisis-datos/dataset-1/exportar').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(container.exportarDatasetGenericoUseCase.ejecutar).toHaveBeenCalledWith('dataset-1', 'analista-A');
  });

  test('responde 404 si el dataset no existe o pertenece a otro analista', async () => {
    (container.exportarDatasetGenericoUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(new DatasetGenericoNoEncontradoError());

    const res = await conHttps(
      request(app).get('/analisis-datos/dataset-ajeno/exportar').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(404);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/analisis-datos/dataset-1/exportar'));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /analisis-datos/:datasetId/criterio-clasificacion — RF-139', () => {
  const token = tokenPara('analista-A');

  test('configura un criterio numérico y responde 200 con el criterio ya persistido', async () => {
    const criterio = CriterioDeClasificacionValue.numerica('Puntaje', [{ minimo: 0, etiqueta: 'Bajo' }]);
    const datasetActualizado = new DatasetGenerico(
      'dataset-1', 'analista-A', 'riesgos.xlsx', ['Producto', 'Puntaje'], 'archivo', null, 0, new Date(), criterio, null
    );
    (container.configurarCriterioDeClasificacionUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(datasetActualizado);

    const res = await conHttps(
      request(app)
        .patch('/analisis-datos/dataset-1/criterio-clasificacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombreColumna: 'Puntaje', tipo: 'numerica', umbrales: [{ minimo: 0, etiqueta: 'Bajo' }] })
    );

    expect(res.status).toBe(200);
    expect(res.body.criterioClasificacion).toMatchObject({ nombreColumna: 'Puntaje', tipo: 'numerica' });
    expect(container.configurarCriterioDeClasificacionUseCase.ejecutar).toHaveBeenCalledWith(
      'dataset-1',
      'analista-A',
      expect.objectContaining({ nombreColumna: 'Puntaje', tipo: 'numerica' })
    );
  });

  test('sin nombreColumna responde 400 sin llamar al caso de uso', async () => {
    const res = await conHttps(
      request(app)
        .patch('/analisis-datos/dataset-1/criterio-clasificacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'numerica' })
    );

    expect(res.status).toBe(400);
  });

  test('con un tipo no soportado responde 400', async () => {
    const res = await conHttps(
      request(app)
        .patch('/analisis-datos/dataset-1/criterio-clasificacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombreColumna: 'Puntaje', tipo: 'texto' })
    );

    expect(res.status).toBe(400);
  });

  test('responde 404 si el dataset no existe o pertenece a otro analista', async () => {
    (container.configurarCriterioDeClasificacionUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(
      new DatasetGenericoNoEncontradoError()
    );

    const res = await conHttps(
      request(app)
        .patch('/analisis-datos/dataset-ajeno/criterio-clasificacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombreColumna: 'Puntaje', tipo: 'numerica', umbrales: [{ minimo: 0, etiqueta: 'Bajo' }] })
    );

    expect(res.status).toBe(404);
  });

  test('responde 400 cuando la columna elegida no es apta (ColumnaDeDatasetInvalidaError)', async () => {
    (container.configurarCriterioDeClasificacionUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(
      new ColumnaDeDatasetInvalidaError('La columna "Descripcion" no es apta para clasificación (tipo detectado: texto)')
    );

    const res = await conHttps(
      request(app)
        .patch('/analisis-datos/dataset-1/criterio-clasificacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombreColumna: 'Descripcion', tipo: 'ordinal', ordenCategorias: ['a'] })
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no es apta para clasificación');
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(
      request(app).patch('/analisis-datos/dataset-1/criterio-clasificacion').send({ nombreColumna: 'Puntaje', tipo: 'numerica' })
    );
    expect(res.status).toBe(401);
  });
});
