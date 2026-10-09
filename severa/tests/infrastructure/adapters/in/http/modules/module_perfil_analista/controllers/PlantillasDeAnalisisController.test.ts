import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PlantillaDeAnalisis } from '../../../../../../../../src/domain/entities/PlantillaDeAnalisis';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import {
  AplicacionDePlantillaSinConfirmarError,
  NombreDePlantillaRepetidoError,
  PlantillaDeAnalisisInvalidaError,
  PlantillaDeAnalisisNoEncontradaError,
  PlantillaIncompatibleError,
  VistaPreviaDePlantillaDesactualizadaError
} from '../../../../../../../../src/domain/errors/PlantillaDeAnalisisErrors';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    guardarPlantillaDeAnalisisUseCase: { ejecutar: jest.fn() },
    listarPlantillasDeAnalisisUseCase: { ejecutar: jest.fn() },
    eliminarPlantillaDeAnalisisUseCase: { ejecutar: jest.fn() },
    aplicarPlantillaDeAnalisisUseCase: { previsualizar: jest.fn(), ejecutar: jest.fn() }
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

const guardar = container.guardarPlantillaDeAnalisisUseCase.ejecutar as jest.Mock;
const listar = container.listarPlantillasDeAnalisisUseCase.ejecutar as jest.Mock;
const eliminar = container.eliminarPlantillaDeAnalisisUseCase.ejecutar as jest.Mock;
const previsualizar = container.aplicarPlantillaDeAnalisisUseCase.previsualizar as jest.Mock;
const aplicar = container.aplicarPlantillaDeAnalisisUseCase.ejecutar as jest.Mock;

const PLANTILLA = new PlantillaDeAnalisis(
  'p1',
  'analista-A',
  'Encuesta mensual',
  { tiposCorregidos: { edad: 'numerica_continua' }, variableObjetivo: 'aprobado', clasificacion: null },
  new Date('2026-10-01T12:00:00Z')
);

beforeEach(() => {
  [guardar, listar, eliminar, previsualizar, aplicar].forEach((mock) => mock.mockReset());
});

describe('GET /plantillas-analisis — RF-12', () => {
  test('lista las plantillas del analista del token, con las columnas que necesita cada una', async () => {
    listar.mockResolvedValueOnce([PLANTILLA]);

    const res = await autenticada(request(app).get('/plantillas-analisis'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'p1',
        nombre: 'Encuesta mensual',
        fechaCreacion: '2026-10-01T12:00:00.000Z',
        configuracion: PLANTILLA.configuracion,
        columnas: ['edad', 'aprobado']
      }
    ]);
    expect(listar).toHaveBeenCalledWith('analista-A');
  });

  test('sin autenticar: 401', async () => {
    const res = await conHttps(request(app).get('/plantillas-analisis'));
    expect(res.status).toBe(401);
    expect(listar).not.toHaveBeenCalled();
  });
});

describe('POST /analisis-datos/:sesionId/plantillas — RF-12', () => {
  test('guarda y responde 201; el analista sale del token, no del body', async () => {
    guardar.mockResolvedValueOnce(PLANTILLA);

    const res = await autenticada(
      request(app).post('/analisis-datos/sesion-1/plantillas').send({ nombre: 'Encuesta mensual', analistaId: 'analista-B' })
    );

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('p1');
    expect(guardar).toHaveBeenCalledWith('analista-A', 'sesion-1', 'Encuesta mensual');
  });

  test('sin nombre: 400 sin llamar al caso de uso', async () => {
    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/plantillas').send({}));
    expect(res.status).toBe(400);
    expect(guardar).not.toHaveBeenCalled();
  });

  test('nombre repetido: 409 con el mensaje para el analista', async () => {
    guardar.mockRejectedValueOnce(new NombreDePlantillaRepetidoError('Encuesta mensual'));

    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/plantillas').send({ nombre: 'encuesta mensual' }));

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya tenés una plantilla con el nombre "Encuesta mensual" (sin distinguir mayúsculas). Elegí otro nombre o eliminá la anterior.');
  });

  test('nada que guardar o nombre inválido: 400', async () => {
    guardar.mockRejectedValueOnce(new PlantillaDeAnalisisInvalidaError('La plantilla necesita un nombre.'));

    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/plantillas').send({ nombre: ' ' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La plantilla necesita un nombre.');
  });

  test('sesión ajena o vencida: 404', async () => {
    guardar.mockRejectedValueOnce(new SesionAnalisisNoEncontradaError());

    const res = await autenticada(request(app).post('/analisis-datos/ajena/plantillas').send({ nombre: 'X' }));

    expect(res.status).toBe(404);
  });
});

describe('DELETE /plantillas-analisis/:plantillaId — RF-12', () => {
  test('elimina y responde 204', async () => {
    eliminar.mockResolvedValueOnce(undefined);

    const res = await autenticada(request(app).delete('/plantillas-analisis/p1'));

    expect(res.status).toBe(204);
    expect(eliminar).toHaveBeenCalledWith('analista-A', 'p1');
  });

  test('ajena o inexistente: 404', async () => {
    eliminar.mockRejectedValueOnce(new PlantillaDeAnalisisNoEncontradaError());

    const res = await autenticada(request(app).delete('/plantillas-analisis/ajena'));

    expect(res.status).toBe(404);
  });
});

describe('GET /analisis-datos/:sesionId/plantillas/:plantillaId/vista-previa — RF-12', () => {
  test('devuelve el plan y la huella', async () => {
    const vista = { plantilla: { id: 'p1', nombre: 'X' }, plan: { aplicable: true, cambios: [] }, huella: 'abc' };
    previsualizar.mockResolvedValueOnce(vista);

    const res = await autenticada(request(app).get('/analisis-datos/sesion-1/plantillas/p1/vista-previa'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(vista);
    expect(previsualizar).toHaveBeenCalledWith('analista-A', 'sesion-1', 'p1');
  });
});

describe('POST /analisis-datos/:sesionId/plantillas/:plantillaId/aplicar — RF-12', () => {
  test('pasa la huella y la confirmación al caso de uso', async () => {
    aplicar.mockResolvedValueOnce({ cambiosAplicados: [] });

    const res = await autenticada(
      request(app).post('/analisis-datos/sesion-1/plantillas/p1/aplicar').send({ huella: 'abc', confirmado: true })
    );

    expect(res.status).toBe(200);
    expect(aplicar).toHaveBeenCalledWith('analista-A', 'sesion-1', 'p1', 'abc', true);
  });

  test('"confirmado" que no es exactamente true cuenta como no confirmado', async () => {
    aplicar.mockRejectedValueOnce(new AplicacionDePlantillaSinConfirmarError());

    const res = await autenticada(
      request(app).post('/analisis-datos/sesion-1/plantillas/p1/aplicar').send({ huella: 'abc', confirmado: 'true' })
    );

    expect(aplicar).toHaveBeenCalledWith('analista-A', 'sesion-1', 'p1', 'abc', false);
    expect(res.status).toBe(400);
  });

  test('sin huella: 400 sin llamar al caso de uso', async () => {
    const res = await autenticada(request(app).post('/analisis-datos/sesion-1/plantillas/p1/aplicar').send({ confirmado: true }));
    expect(res.status).toBe(400);
    expect(aplicar).not.toHaveBeenCalled();
  });

  test('incompatible: 400 con la lista de columnas faltantes y problemas', async () => {
    aplicar.mockRejectedValueOnce(new PlantillaIncompatibleError(['codigo'], ['otro problema']));

    const res = await autenticada(
      request(app).post('/analisis-datos/sesion-1/plantillas/p1/aplicar').send({ huella: 'abc', confirmado: true })
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: expect.stringContaining('al dataset le faltan las columnas "codigo"'),
      columnasFaltantes: ['codigo'],
      problemas: ['otro problema']
    });
  });

  test('vista previa desactualizada: 409', async () => {
    aplicar.mockRejectedValueOnce(new VistaPreviaDePlantillaDesactualizadaError());

    const res = await autenticada(
      request(app).post('/analisis-datos/sesion-1/plantillas/p1/aplicar').send({ huella: 'vieja', confirmado: true })
    );

    expect(res.status).toBe(409);
  });
});
