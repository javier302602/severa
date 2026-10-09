import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DatasetGenericoNoEncontradoError } from '../../../../../../../../src/domain/errors/DatasetGenericoNoEncontradoError';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    listarDatasetsGenericosUseCase: { ejecutar: jest.fn() },
    listarVersionesDeDatasetUseCase: { ejecutar: jest.fn() },
    abrirDatasetGenericoUseCase: { ejecutar: jest.fn() },
    exportarDatasetGenericoUseCase: { ejecutar: jest.fn() }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';

const app = createApp();
const token = jwt.sign({ sub: 'analista-A', rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function autenticada(req: request.Test): request.Test {
  return conHttps(req).set('Authorization', `Bearer ${token}`);
}

const listar = container.listarDatasetsGenericosUseCase.ejecutar as jest.Mock;
const versiones = container.listarVersionesDeDatasetUseCase.ejecutar as jest.Mock;
const abrir = container.abrirDatasetGenericoUseCase.ejecutar as jest.Mock;
const exportar = container.exportarDatasetGenericoUseCase.ejecutar as jest.Mock;

beforeEach(() => {
  [listar, versiones, abrir, exportar].forEach((mock) => mock.mockReset());
});

// RF-136: "el analista puede consultar y recuperar versiones anteriores".
describe('GET /analisis-datos/datasets — RF-136', () => {
  test('lista los datasets del analista del token', async () => {
    listar.mockResolvedValueOnce([
      {
        datasetOriginalId: 'dataset-1',
        nombreArchivo: 'encuesta.csv',
        fechaCarga: new Date('2026-03-01T10:00:00Z'),
        totalFilas: 10,
        totalColumnas: 3,
        versionesProcesadas: 2,
        ultimaVersion: { datasetId: 'dataset-v2', version: 2, fecha: new Date('2026-03-02T10:00:00Z') }
      }
    ]);

    const res = await autenticada(request(app).get('/analisis-datos/datasets'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        datasetOriginalId: 'dataset-1',
        nombreArchivo: 'encuesta.csv',
        fechaCarga: '2026-03-01T10:00:00.000Z',
        totalFilas: 10,
        totalColumnas: 3,
        versionesProcesadas: 2,
        ultimaVersion: { datasetId: 'dataset-v2', version: 2, fecha: '2026-03-02T10:00:00.000Z' }
      }
    ]);
    expect(listar).toHaveBeenCalledWith('analista-A');
  });

  test('"datasets" no se confunde con el id de un dataset: no llega a ninguna ruta de /:datasetId/...', async () => {
    listar.mockResolvedValueOnce([]);

    await autenticada(request(app).get('/analisis-datos/datasets'));

    expect(versiones).not.toHaveBeenCalled();
    expect(exportar).not.toHaveBeenCalled();
  });

  test('sin autenticar: 401', async () => {
    expect((await conHttps(request(app).get('/analisis-datos/datasets'))).status).toBe(401);
    expect(listar).not.toHaveBeenCalled();
  });
});

describe('GET /analisis-datos/:datasetId/versiones — RF-136', () => {
  test('devuelve las versiones de la familia', async () => {
    const lista = [
      { datasetId: 'dataset-1', version: 0, versionBase: null, esOriginal: true, fecha: '2026-03-01T10:00:00.000Z', totalFilas: 10, totalColumnas: 3, operaciones: [] }
    ];
    versiones.mockResolvedValueOnce(lista);

    const res = await autenticada(request(app).get('/analisis-datos/dataset-1/versiones'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(lista);
    expect(versiones).toHaveBeenCalledWith('analista-A', 'dataset-1');
  });

  test('dataset inexistente o ajeno: 404; sin autenticar: 401', async () => {
    versiones.mockRejectedValueOnce(new DatasetGenericoNoEncontradoError());

    expect((await autenticada(request(app).get('/analisis-datos/ajeno/versiones'))).status).toBe(404);
    expect((await conHttps(request(app).get('/analisis-datos/dataset-1/versiones'))).status).toBe(401);
  });
});

describe('POST /analisis-datos/:datasetId/abrir — RF-136 (recuperar una versión)', () => {
  test('abre la versión y responde 201 con la sesión nueva', async () => {
    const abierto = { sesionId: 'sesion-9', datasetId: 'dataset-v1', datasetOriginalId: 'dataset-1', version: 1, versionBase: 0 };
    abrir.mockResolvedValueOnce(abierto);

    const res = await autenticada(request(app).post('/analisis-datos/dataset-v1/abrir'));

    expect(res.status).toBe(201);
    expect(res.body).toEqual(abierto);
    expect(abrir).toHaveBeenCalledWith('analista-A', 'dataset-v1');
  });

  test('dataset inexistente o ajeno: 404; sin autenticar: 401', async () => {
    abrir.mockRejectedValueOnce(new DatasetGenericoNoEncontradoError());

    expect((await autenticada(request(app).post('/analisis-datos/ajeno/abrir'))).status).toBe(404);
    expect((await conHttps(request(app).post('/analisis-datos/dataset-1/abrir'))).status).toBe(401);
  });

  test('abrir es POST: un GET a esa ruta no abre nada', async () => {
    const res = await autenticada(request(app).get('/analisis-datos/dataset-1/abrir'));

    expect(res.status).toBe(404);
    expect(abrir).not.toHaveBeenCalled();
  });
});
