import request from 'supertest';
import jwt from 'jsonwebtoken';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { SesionSinDatasetError } from '../../../../../../../../src/domain/errors/SesionSinDatasetError';
import { ColumnaDeDatasetInvalidaError } from '../../../../../../../../src/domain/errors/ColumnaDeDatasetInvalidaError';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    evaluarSerieDeTiempoGenericoUseCase: { ejecutar: jest.fn() },
    sugerirVariableObjetivoUseCase: { ejecutar: jest.fn() },
    definirVariableObjetivoUseCase: { ejecutar: jest.fn() },
    corregirTipoDeVariableUseCase: { ejecutar: jest.fn() }
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

const serieDeTiempo = container.evaluarSerieDeTiempoGenericoUseCase.ejecutar as jest.Mock;
const sugerir = container.sugerirVariableObjetivoUseCase.ejecutar as jest.Mock;
const definir = container.definirVariableObjetivoUseCase.ejecutar as jest.Mock;
const corregir = container.corregirTipoDeVariableUseCase.ejecutar as jest.Mock;

beforeEach(() => {
  [serieDeTiempo, sugerir, definir, corregir].forEach((mock) => mock.mockReset());
});

describe('GET /analisis-datos/:sesionId/serie-de-tiempo — RF-108', () => {
  test('devuelve la evaluación, con el analista tomado del token', async () => {
    const evaluacion = { columnasTemporales: [], esViableComoSerieDeTiempo: false, columnaSugerida: null, variablesNumericas: [], resumen: 'x' };
    serieDeTiempo.mockResolvedValueOnce(evaluacion);

    const res = await autenticada(request(app).get('/analisis-datos/sesion-1/serie-de-tiempo'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(evaluacion);
    expect(serieDeTiempo).toHaveBeenCalledWith('analista-A', 'sesion-1');
  });

  test('sesión inexistente o ajena: 404', async () => {
    serieDeTiempo.mockRejectedValueOnce(new SesionAnalisisNoEncontradaError());

    const res = await autenticada(request(app).get('/analisis-datos/no-existe/serie-de-tiempo'));

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('sin autenticar: 401', async () => {
    const res = await conHttps(request(app).get('/analisis-datos/sesion-1/serie-de-tiempo'));

    expect(res.status).toBe(401);
    expect(serieDeTiempo).not.toHaveBeenCalled();
  });
});

describe('GET /analisis-datos/:sesionId/variable-objetivo — RF-110', () => {
  test('devuelve candidatas, decisión vigente y columnas elegibles', async () => {
    const estado = { candidatas: [], nota: 'n', decision: { estado: 'pendiente', columna: null }, columnasElegibles: ['a'] };
    sugerir.mockResolvedValueOnce(estado);

    const res = await autenticada(request(app).get('/analisis-datos/sesion-1/variable-objetivo'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(estado);
    expect(sugerir).toHaveBeenCalledWith('analista-A', 'sesion-1');
  });

  test('consultar las sugerencias nunca llama a definir', async () => {
    sugerir.mockResolvedValueOnce({ candidatas: [], nota: '', decision: { estado: 'pendiente', columna: null }, columnasElegibles: [] });

    await autenticada(request(app).get('/analisis-datos/sesion-1/variable-objetivo'));

    expect(definir).not.toHaveBeenCalled();
  });

  test('una sesión sin dataset guardado: 400 con el motivo', async () => {
    sugerir.mockRejectedValueOnce(new SesionSinDatasetError());

    const res = await autenticada(request(app).get('/analisis-datos/sesion-1/variable-objetivo'));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no está asociada a un dataset guardado/);
  });
});

describe('PUT /analisis-datos/:sesionId/variable-objetivo — RF-110', () => {
  test('confirma la columna que manda el analista', async () => {
    const resultado = { decision: { estado: 'confirmada', columna: 'aprobado' }, huboCambio: true };
    definir.mockResolvedValueOnce(resultado);

    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/variable-objetivo').send({ columna: 'aprobado' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resultado);
    expect(definir).toHaveBeenCalledWith('analista-A', 'sesion-1', 'aprobado');
  });

  test('con columna null, descarta las sugerencias', async () => {
    definir.mockResolvedValueOnce({ decision: { estado: 'rechazada', columna: null }, huboCambio: true });

    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/variable-objetivo').send({ columna: null }));

    expect(res.status).toBe(200);
    expect(definir).toHaveBeenCalledWith('analista-A', 'sesion-1', null);
  });

  test.each([
    ['sin el campo "columna"', {}],
    ['con columna vacía', { columna: '   ' }],
    ['con columna numérica', { columna: 3 }],
    ['con una lista', { columna: ['a'] }]
  ])('%s: 400 y no se define nada (un cuerpo incompleto no se interpreta como rechazo)', async (_caso, cuerpo) => {
    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/variable-objetivo').send(cuerpo));

    expect(res.status).toBe(400);
    expect(definir).not.toHaveBeenCalled();
  });

  test('una columna que no puede ser objetivo: 400 con el mensaje del dominio', async () => {
    definir.mockRejectedValueOnce(new ColumnaDeDatasetInvalidaError('La columna "codigo" no puede ser variable objetivo: es un identificador, un texto libre o una fecha.'));

    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/variable-objetivo').send({ columna: 'codigo' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no puede ser variable objetivo/);
  });

  test('sin autenticar: 401', async () => {
    const res = await conHttps(request(app).put('/analisis-datos/sesion-1/variable-objetivo').send({ columna: 'aprobado' }));

    expect(res.status).toBe(401);
    expect(definir).not.toHaveBeenCalled();
  });
});

describe('PUT /analisis-datos/:sesionId/tipo-de-variable — RF-111', () => {
  test('corrige el tipo y devuelve el resultado con los análisis recalculados', async () => {
    const resultado = { huboCambio: true, columna: 'cp', tipoVigente: 'categorica_nominal', diagnostico: {}, perfilVariables: [] };
    corregir.mockResolvedValueOnce(resultado);

    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/tipo-de-variable').send({ columna: 'cp', tipo: 'categorica_nominal' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resultado);
    expect(corregir).toHaveBeenCalledWith('analista-A', 'sesion-1', 'cp', 'categorica_nominal');
  });

  test('con tipo null, vuelve a la detección automática', async () => {
    corregir.mockResolvedValueOnce({ huboCambio: true });

    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/tipo-de-variable').send({ columna: 'cp', tipo: null }));

    expect(res.status).toBe(200);
    expect(corregir).toHaveBeenCalledWith('analista-A', 'sesion-1', 'cp', null);
  });

  test.each([
    ['sin "tipo"', { columna: 'cp' }],
    ['sin "columna"', { tipo: 'categorica_nominal' }],
    ['con un tipo que no existe', { columna: 'cp', tipo: 'moneda' }],
    ['con el tipo de 4 valores en vez del detallado', { columna: 'cp', tipo: 'numerica' }],
    ['con columna vacía', { columna: '', tipo: 'categorica_nominal' }]
  ])('%s: 400 y no se corrige nada', async (_caso, cuerpo) => {
    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/tipo-de-variable').send(cuerpo));

    expect(res.status).toBe(400);
    expect(corregir).not.toHaveBeenCalled();
  });

  test('el error de un tipo inválido lista los tipos que sí se aceptan', async () => {
    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/tipo-de-variable').send({ columna: 'cp', tipo: 'moneda' }));

    expect(res.body.error).toMatch(/numerica_continua, numerica_discreta, categorica_nominal/);
  });

  test('un tipo que los datos no admiten: 400 con la explicación', async () => {
    corregir.mockRejectedValueOnce(new ColumnaDeDatasetInvalidaError('No se puede tratar "sede" como numérica continua: ninguno de sus valores es un número.'));

    const res = await autenticada(request(app).put('/analisis-datos/sesion-1/tipo-de-variable').send({ columna: 'sede', tipo: 'numerica_continua' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No se puede tratar "sede" como numérica continua: ninguno de sus valores es un número.');
  });

  test('sesión inexistente o ajena: 404', async () => {
    corregir.mockRejectedValueOnce(new SesionAnalisisNoEncontradaError());

    const res = await autenticada(request(app).put('/analisis-datos/ajena/tipo-de-variable').send({ columna: 'cp', tipo: 'categorica_nominal' }));

    expect(res.status).toBe(404);
  });
});
