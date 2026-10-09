import request from 'supertest';
import jwt from 'jsonwebtoken';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetGenericoNoEncontradoError } from '../../../../../../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { TratamientoDeFaltantesInvalidoError } from '../../../../../../../../src/domain/errors/TratamientoDeFaltantesInvalidoError';
import { EntradaDeBitacoraDeDataset } from '../../../../../../../../src/domain/entities/EntradaDeBitacoraDeDataset';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    proponerTratamientoDeFaltantesUseCase: { ejecutar: jest.fn() },
    aplicarLimpiezaDeDatasetUseCase: { previsualizar: jest.fn(), ejecutar: jest.fn() },
    consultarBitacoraDeDatasetUseCase: { ejecutar: jest.fn() }
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

const proponer = container.proponerTratamientoDeFaltantesUseCase.ejecutar as jest.Mock;
const previsualizar = container.aplicarLimpiezaDeDatasetUseCase.previsualizar as jest.Mock;
const aplicar = container.aplicarLimpiezaDeDatasetUseCase.ejecutar as jest.Mock;
const bitacora = container.consultarBitacoraDeDatasetUseCase.ejecutar as jest.Mock;

const DECISIONES = [
  { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
  { columna: 'ciudad', estrategia: 'eliminar_registros' }
];

beforeEach(() => {
  [proponer, previsualizar, aplicar, bitacora].forEach((mock) => mock.mockReset());
});

describe('GET /analisis-datos/:sesionId/limpieza/propuesta — RF-120', () => {
  test('devuelve la propuesta de la sesión del analista', async () => {
    const propuesta = { totalFilas: 10, totalColumnas: 2, propuestas: [] };
    proponer.mockResolvedValueOnce(propuesta);

    const res = await autenticada(request(app).get('/analisis-datos/sesion-1/limpieza/propuesta'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(propuesta);
    expect(proponer).toHaveBeenCalledWith('analista-A', 'sesion-1');
  });

  test('pedir la propuesta nunca aplica nada', async () => {
    proponer.mockResolvedValueOnce({ totalFilas: 0, totalColumnas: 0, propuestas: [] });

    await autenticada(request(app).get('/analisis-datos/sesion-1/limpieza/propuesta'));

    expect(aplicar).not.toHaveBeenCalled();
  });

  test('sesión inexistente o ajena: 404; sin autenticar: 401', async () => {
    proponer.mockRejectedValueOnce(new SesionAnalisisNoEncontradaError());

    expect((await autenticada(request(app).get('/analisis-datos/ajena/limpieza/propuesta'))).status).toBe(404);
    expect((await conHttps(request(app).get('/analisis-datos/sesion-1/limpieza/propuesta'))).status).toBe(401);
  });
});

describe('POST /analisis-datos/:sesionId/limpieza/vista-previa — RF-120', () => {
  test('calcula el resumen con las decisiones recibidas, sin aplicar', async () => {
    const resumen = { filasAntes: 10, filasDespues: 9, filasEliminadas: 1, columnasEliminadas: [], celdasImputadas: 2, operaciones: [] };
    previsualizar.mockResolvedValueOnce(resumen);

    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/limpieza/vista-previa').send({ decisiones: DECISIONES }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resumen);
    expect(previsualizar).toHaveBeenCalledWith('analista-A', 'sesion-1', DECISIONES);
    expect(aplicar).not.toHaveBeenCalled();
  });

  test('aunque el cuerpo traiga "confirmado": true, la vista previa no aplica', async () => {
    previsualizar.mockResolvedValueOnce({});

    await autenticada(request(app).post('/analisis-datos/sesion-1/limpieza/vista-previa').send({ decisiones: DECISIONES, confirmado: true }));

    expect(aplicar).not.toHaveBeenCalled();
  });

  test('una decisión que el dominio rechaza: 400 con su mensaje', async () => {
    previsualizar.mockRejectedValueOnce(new TratamientoDeFaltantesInvalidoError('La columna "peso" no existe en este dataset.'));

    const res = await autenticada(
      request(app).post('/analisis-datos/sesion-1/limpieza/vista-previa').send({ decisiones: [{ columna: 'peso', estrategia: 'eliminar_columna' }] })
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La columna "peso" no existe en este dataset.');
  });
});

describe('POST /analisis-datos/:sesionId/limpieza — RF-120/121', () => {
  test('con confirmado: true aplica y responde 201 con la versión nueva', async () => {
    const resultado = { sesionId: 'sesion-2', datasetId: 'dataset-v1', version: 1, versionBase: 0, resumen: {} };
    aplicar.mockResolvedValueOnce(resultado);

    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/limpieza').send({ decisiones: DECISIONES, confirmado: true }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual(resultado);
    expect(aplicar).toHaveBeenCalledWith('analista-A', 'sesion-1', DECISIONES, true);
  });

  // RF-120: "nunca aplica una estrategia sin confirmación explícita". El
  // controlador pasa `false` salvo que el cuerpo traiga exactamente el
  // booleano true; quien rechaza es el caso de uso (acá simulado).
  test.each([
    ['ausente', {}],
    ['false', { confirmado: false }],
    ['el texto "true"', { confirmado: 'true' }],
    ['1', { confirmado: 1 }],
    ['null', { confirmado: null }]
  ])('con confirmado %s llega como NO confirmado, y la respuesta es 400', async (_caso, extra) => {
    aplicar.mockRejectedValueOnce(new TratamientoDeFaltantesInvalidoError('La limpieza no se aplica sin confirmación explícita.'));

    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/limpieza').send({ decisiones: DECISIONES, ...extra }));

    expect(aplicar).toHaveBeenCalledWith('analista-A', 'sesion-1', DECISIONES, false);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sin confirmación explícita/);
  });

  test.each([
    ['sin "decisiones"', { confirmado: true }],
    ['con "decisiones" que no es una lista', { decisiones: { columna: 'edad' }, confirmado: true }],
    ['con una decisión que no es un objeto', { decisiones: ['edad'], confirmado: true }],
    ['con una decisión sin columna', { decisiones: [{ estrategia: 'imputar', metodo: 'media' }], confirmado: true }],
    ['con una estrategia que no existe', { decisiones: [{ columna: 'edad', estrategia: 'interpolar' }], confirmado: true }],
    ['con un método que no es media, mediana ni moda', { decisiones: [{ columna: 'edad', estrategia: 'imputar', metodo: 'knn' }], confirmado: true }],
    ['con un método que no es texto', { decisiones: [{ columna: 'edad', estrategia: 'imputar', metodo: 5 }], confirmado: true }]
  ])('%s: 400 sin llegar al caso de uso', async (_caso, cuerpo) => {
    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/limpieza').send(cuerpo));

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(aplicar).not.toHaveBeenCalled();
  });

  test('solo pasan al caso de uso los campos de una decisión; lo demás del cuerpo se descarta', async () => {
    aplicar.mockResolvedValueOnce({});

    await autenticada(
      request(app)
        .post('/analisis-datos/sesion-1/limpieza')
        .send({ decisiones: [{ columna: 'edad', estrategia: 'imputar', metodo: 'media', analistaId: 'otro', valor: 99 }], confirmado: true })
    );

    expect(aplicar).toHaveBeenCalledWith('analista-A', 'sesion-1', [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }], true);
  });

  test('un método null se trata como "sin método" (lo decide el dominio según la estrategia)', async () => {
    aplicar.mockResolvedValueOnce({});

    await autenticada(
      request(app).post('/analisis-datos/sesion-1/limpieza').send({ decisiones: [{ columna: 'ciudad', estrategia: 'eliminar_registros', metodo: null }], confirmado: true })
    );

    expect(aplicar).toHaveBeenCalledWith('analista-A', 'sesion-1', [{ columna: 'ciudad', estrategia: 'eliminar_registros' }], true);
  });

  test('sesión inexistente o ajena: 404; sin autenticar: 401', async () => {
    aplicar.mockRejectedValueOnce(new SesionAnalisisNoEncontradaError());

    expect((await autenticada(request(app).post('/analisis-datos/ajena/limpieza').send({ decisiones: DECISIONES, confirmado: true }))).status).toBe(404);
    expect((await conHttps(request(app).post('/analisis-datos/sesion-1/limpieza').send({ decisiones: DECISIONES, confirmado: true }))).status).toBe(401);
  });
});

describe('GET /analisis-datos/:datasetId/bitacora — RF-123', () => {
  test('devuelve las entradas con los campos que pide el requisito', async () => {
    bitacora.mockResolvedValueOnce([
      new EntradaDeBitacoraDeDataset(
        'b1',
        'dataset-1',
        'analista-A',
        new Date('2026-03-01T10:00:00Z'),
        0,
        'imputar',
        'edad',
        2,
        'media',
        0,
        1,
        { valorImputado: 30 },
        'Ana Pérez'
      )
    ]);

    const res = await autenticada(request(app).get('/analisis-datos/dataset-1/bitacora'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'b1',
        datasetOriginalId: 'dataset-1',
        analistaId: 'analista-A',
        fecha: '2026-03-01T10:00:00.000Z',
        secuencia: 0,
        operacion: 'imputar',
        variable: 'edad',
        registrosAfectados: 2,
        metodo: 'media',
        versionOrigen: 0,
        versionResultado: 1,
        detalle: { valorImputado: 30 },
        nombreAnalista: 'Ana Pérez'
      }
    ]);
    expect(bitacora).toHaveBeenCalledWith('analista-A', 'dataset-1');
  });

  test('dataset inexistente o ajeno: 404; sin autenticar: 401', async () => {
    bitacora.mockRejectedValueOnce(new DatasetGenericoNoEncontradoError());

    expect((await autenticada(request(app).get('/analisis-datos/ajeno/bitacora'))).status).toBe(404);
    expect((await conHttps(request(app).get('/analisis-datos/dataset-1/bitacora'))).status).toBe(401);
  });
});
