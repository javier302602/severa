import request from 'supertest';
import jwt from 'jsonwebtoken';
import { EscalaDeClasificacion } from '../../../../../../../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { EscalaDeClasificacionInvalidaError } from '../../../../../../../../src/domain/errors/EscalaDeClasificacionInvalidaError';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    obtenerEscalaDeClasificacionUseCase: { ejecutar: jest.fn() },
    guardarEscalaDeClasificacionUseCase: { ejecutar: jest.fn() },
    restablecerEscalaDeClasificacionUseCase: { ejecutar: jest.fn() }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';

const app = createApp();
const token = jwt.sign({ sub: 'analista-A', rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
const autenticada = (req: request.Test) => req.set('x-forwarded-proto', 'https').set('Authorization', `Bearer ${token}`);

const obtener = container.obtenerEscalaDeClasificacionUseCase.ejecutar as jest.Mock;
const guardar = container.guardarEscalaDeClasificacionUseCase.ejecutar as jest.Mock;
const restablecer = container.restablecerEscalaDeClasificacionUseCase.ejecutar as jest.Mock;

const PROPIA = EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 });

beforeEach(() => [obtener, guardar, restablecer].forEach((mock) => mock.mockReset()));

describe('/escala-clasificacion — RF-28 / RF-69', () => {
  test('GET devuelve la vigente del analista del token, con sus rangos y cómo se nombra', async () => {
    obtener.mockResolvedValueOnce({ escala: PROPIA, personalizada: true });

    const res = await autenticada(request(app).get('/escala-clasificacion'));

    expect(res.status).toBe(200);
    expect(obtener).toHaveBeenCalledWith('analista-A');
    expect(res.body).toEqual({
      personalizada: true,
      cortes: { moderado: 4, alto: 7, critico: 8.5 },
      rangos: [
        { nivel: 'Bajo', minimo: 0, menorQue: 4 },
        { nivel: 'Moderado', minimo: 4, menorQue: 7 },
        { nivel: 'Alto', minimo: 7, menorQue: 8.5 },
        { nivel: 'Crítico', minimo: 8.5, menorQue: null }
      ],
      descripcion: 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5',
      cortesCvss: { moderado: 4, alto: 7, critico: 9 }
    });
  });

  test('PUT guarda los cortes del cuerpo; un analistaId en el cuerpo se ignora', async () => {
    guardar.mockResolvedValueOnce({ escala: PROPIA, personalizada: true, anterior: {}, huboCambio: true });

    const res = await autenticada(request(app).put('/escala-clasificacion')).send({ moderado: 4, alto: 7, critico: 8.5, analistaId: 'analista-B' });

    expect(res.status).toBe(200);
    expect(guardar).toHaveBeenCalledWith('analista-A', { moderado: 4, alto: 7, critico: 8.5 });
  });

  test('PUT con cortes que no son números: 400 sin llamar al caso de uso', async () => {
    const res = await autenticada(request(app).put('/escala-clasificacion')).send({ moderado: '4', alto: 7, critico: 9 });

    expect(res.status).toBe(400);
    expect(guardar).not.toHaveBeenCalled();
  });

  test('PUT con una escala inválida: 400 con el motivo para el analista', async () => {
    guardar.mockRejectedValueOnce(new EscalaDeClasificacionInvalidaError('Los cortes tienen que ir en orden.'));

    const res = await autenticada(request(app).put('/escala-clasificacion')).send({ moderado: 7, alto: 4, critico: 9 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Los cortes tienen que ir en orden.');
  });

  test('DELETE vuelve a la escala CVSS', async () => {
    restablecer.mockResolvedValueOnce({ escala: EscalaDeClasificacion.CVSS, personalizada: false, anterior: {}, huboCambio: true });

    const res = await autenticada(request(app).delete('/escala-clasificacion'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ personalizada: false, descripcion: 'Escala CVSS (por defecto)' });
    expect(restablecer).toHaveBeenCalledWith('analista-A');
  });

  test('sin autenticar: 401', async () => {
    const res = await request(app).get('/escala-clasificacion').set('x-forwarded-proto', 'https');
    expect(res.status).toBe(401);
  });
});
