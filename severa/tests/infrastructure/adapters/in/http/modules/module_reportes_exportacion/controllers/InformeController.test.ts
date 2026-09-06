import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../src/infrastructure/config/container', () => ({
  container: {
    programarInformePeriodicoUseCase: {
      ejecutar: jest.fn().mockResolvedValue(undefined)
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

describe('POST /informes/programar (RF-83, Sprint 14)', () => {
  const token = tokenPara('analista-A');

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('programa el informe periódico con el analista del token, no uno del body', async () => {
    const res = await conHttps(
      request(app)
        .post('/informes/programar')
        .set('Authorization', `Bearer ${token}`)
        .send({ frecuencia: 'semanal', analistaId: 'analista-suplantado' })
    );

    expect(res.status).toBe(202);
    expect(container.programarInformePeriodicoUseCase.ejecutar).toHaveBeenCalledWith('semanal', 'analista-A');
  });

  test('rechaza una frecuencia inválida con 400', async () => {
    const res = await conHttps(
      request(app).post('/informes/programar').set('Authorization', `Bearer ${token}`).send({ frecuencia: 'diaria' })
    );

    expect(res.status).toBe(400);
    expect(container.programarInformePeriodicoUseCase.ejecutar).not.toHaveBeenCalled();
  });
});
