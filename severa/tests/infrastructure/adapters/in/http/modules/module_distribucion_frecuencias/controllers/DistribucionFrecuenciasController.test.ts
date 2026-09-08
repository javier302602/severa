import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    generarDistribucionFrecuenciasUseCase: {
      ejecutar: jest.fn(async (tipo: 'agrupada' | 'sinAgrupar') => {
        if (tipo === 'agrupada') {
          return [{ intervalo: '[0-2)' }, { intervalo: '[2-4)' }];
        }
        return [{ valor: 9.8, frecuencia: 1 }];
      })
    }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function conToken(req: request.Test): request.Test {
  const token = jwt.sign({ sub: 'analista-1', rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
  return req.set('Authorization', `Bearer ${token}`);
}

describe('GET /estadistica/frecuencias — RF-33/RF-34/RF-39', () => {
  test('tipo=sinAgrupar delega en el caso de uso con ese tipo', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias').query({ tipo: 'sinAgrupar' })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ valor: 9.8, frecuencia: 1 }]);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith(
      'sinAgrupar',
      'analista-1',
      undefined,
      undefined
    );
  });

  test('sin tipo, usa sinAgrupar por defecto', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias')));

    expect(res.status).toBe(200);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith(
      'sinAgrupar',
      'analista-1',
      undefined,
      undefined
    );
  });

  test('tipo=agrupada con numeroDeIntervalos manual válido lo pasa al caso de uso', async () => {
    const res = await conToken(
      conHttps(request(app).get('/estadistica/frecuencias').query({ tipo: 'agrupada', numeroDeIntervalos: 2 }))
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ intervalo: '[0-2)' }, { intervalo: '[2-4)' }]);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith('agrupada', 'analista-1', undefined, 2);
  });

  test('numeroDeIntervalos inválido responde 400, no 500 (propagado por el error-handler global)', async () => {
    (container.generarDistribucionFrecuenciasUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(
      new Error('El número de intervalos debe ser un entero entre 2 y 30')
    );

    const res = await conToken(
      conHttps(request(app).get('/estadistica/frecuencias').query({ tipo: 'agrupada', numeroDeIntervalos: 0 }))
    );

    expect(res.status).toBe(400);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/estadistica/frecuencias'));
    expect(res.status).toBe(401);
  });
});
