import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    obtenerNotificacionesUseCase: { ejecutar: jest.fn() },
    marcarNotificacionLeidaUseCase: { ejecutar: jest.fn() },
    marcarTodasLasNotificacionesLeidasUseCase: { ejecutar: jest.fn() },
    eliminarNotificacionesUseCase: { ejecutar: jest.fn() },
    eliminarNotificacionesLeidasUseCase: { ejecutar: jest.fn() }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';
import { Notificacion } from '../../../../../../../../src/domain/entities/Notificacion';

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function tokenPara(sub: string): string {
  return jwt.sign({ sub, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function pagina(notificaciones: Notificacion[], extras: Partial<{ total: number; noLeidas: number; limite: number; desplazamiento: number }> = {}) {
  return { notificaciones, total: notificaciones.length, noLeidas: 0, limite: 50, desplazamiento: 0, ...extras };
}

describe('GET /notificaciones — RF-103', () => {
  const obtener = container.obtenerNotificacionesUseCase.ejecutar as jest.Mock;

  beforeEach(() => obtener.mockReset());

  test('camino feliz: devuelve una página del centro de notificaciones, con el total y las no leídas', async () => {
    const notificaciones = [
      new Notificacion('n1', 'VulnerabilidadCritica', 'analista-1', false, new Date('2026-01-02'), 'Vulnerabilidad crítica detectada: CVE-2021-44228 (CVSS 9.8)'),
      new Notificacion('n2', 'PlazoVencido', 'analista-1', true, new Date('2026-01-01'), 'Plazo de remediación excedido: CVE-2021-45046')
    ];
    obtener.mockResolvedValueOnce(pagina(notificaciones, { total: 137, noLeidas: 12 }));

    const res = await conHttps(request(app).get('/notificaciones').set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      notificaciones: [
        { id: 'n1', tipo: 'VulnerabilidadCritica', leida: false, fecha: '2026-01-02T00:00:00.000Z', mensaje: 'Vulnerabilidad crítica detectada: CVE-2021-44228 (CVSS 9.8)' },
        { id: 'n2', tipo: 'PlazoVencido', leida: true, fecha: '2026-01-01T00:00:00.000Z', mensaje: 'Plazo de remediación excedido: CVE-2021-45046' }
      ],
      total: 137,
      noLeidas: 12,
      limite: 50,
      desplazamiento: 0
    });
    // Sin parámetros, el caso de uso decide el tamaño de página por defecto.
    expect(obtener).toHaveBeenCalledWith('analista-1', { limite: undefined, desplazamiento: undefined });
  });

  test('pasa el límite y el desplazamiento pedidos', async () => {
    obtener.mockResolvedValueOnce(pagina([], { limite: 20, desplazamiento: 40 }));

    const res = await conHttps(
      request(app).get('/notificaciones').query({ limite: '20', desplazamiento: '40' }).set('Authorization', `Bearer ${tokenPara('analista-1')}`)
    );

    expect(res.status).toBe(200);
    expect(obtener).toHaveBeenCalledWith('analista-1', { limite: 20, desplazamiento: 40 });
  });

  test.each([
    ['limite=0', { limite: '0' }],
    ['limite negativo', { limite: '-5' }],
    ['limite no numérico', { limite: 'todas' }],
    ['limite con decimales', { limite: '10.5' }],
    ['desplazamiento negativo', { desplazamiento: '-1' }],
    ['desplazamiento no numérico', { desplazamiento: 'abc' }],
    ['limite repetido', { limite: ['10', '20'] }]
  ])('%s: 400, sin consultar nada', async (_caso, query) => {
    const res = await conHttps(request(app).get('/notificaciones').query(query).set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/"limite" debe ser un entero entre 1 y 200/);
    expect(obtener).not.toHaveBeenCalled();
  });

  test('IDOR/scoping: el analistaId siempre sale del token, nunca de un query param', async () => {
    obtener.mockResolvedValueOnce(pagina([]));

    await conHttps(
      request(app).get('/notificaciones').query({ analistaId: 'analista-ajeno' }).set('Authorization', `Bearer ${tokenPara('analista-2')}`)
    );

    expect(obtener).toHaveBeenCalledWith('analista-2', expect.anything());
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).get('/notificaciones'));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /notificaciones/leidas — RF-104', () => {
  const eliminarLeidas = container.eliminarNotificacionesLeidasUseCase.ejecutar as jest.Mock;

  beforeEach(() => {
    eliminarLeidas.mockReset();
    (container.eliminarNotificacionesUseCase.ejecutar as jest.Mock).mockClear();
  });

  test('elimina las leídas del analista del token y devuelve cuántas fueron', async () => {
    eliminarLeidas.mockResolvedValueOnce(42);

    const res = await conHttps(request(app).delete('/notificaciones/leidas').set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eliminadas: 42 });
    expect(eliminarLeidas).toHaveBeenCalledWith('analista-1');
    // No se confunde con "eliminar seleccionadas" (DELETE /notificaciones con ids).
    expect(container.eliminarNotificacionesUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).delete('/notificaciones/leidas'));

    expect(res.status).toBe(401);
    expect(eliminarLeidas).not.toHaveBeenCalled();
  });
});

describe('PATCH /notificaciones/:id/leida — RF-104', () => {
  test('camino feliz: responde 204 sin cuerpo', async () => {
    (container.marcarNotificacionLeidaUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(
      new Notificacion('n1', 'InformeListo', 'analista-1', true)
    );

    const res = await conHttps(request(app).patch('/notificaciones/n1/leida').set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(container.marcarNotificacionLeidaUseCase.ejecutar).toHaveBeenCalledWith('n1', 'analista-1');
  });

  test('id inexistente responde 404', async () => {
    (container.marcarNotificacionLeidaUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(null);

    const res = await conHttps(request(app).patch('/notificaciones/no-existe/leida').set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.status).toBe(404);
  });

  test('IDOR: una notificación de otro analista responde 404 (no 403 — no revela existencia)', async () => {
    (container.marcarNotificacionLeidaUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(null);

    const res = await conHttps(request(app).patch('/notificaciones/n-de-otro/leida').set('Authorization', `Bearer ${tokenPara('analista-2')}`));

    expect(res.status).toBe(404);
    expect(container.marcarNotificacionLeidaUseCase.ejecutar).toHaveBeenCalledWith('n-de-otro', 'analista-2');
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).patch('/notificaciones/n1/leida'));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /notificaciones/marcar-todas-leidas — RF-104', () => {
  test('camino feliz: responde 200 con la cantidad marcada', async () => {
    (container.marcarTodasLasNotificacionesLeidasUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(5);

    const res = await conHttps(request(app).patch('/notificaciones/marcar-todas-leidas').set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marcadas: 5 });
    expect(container.marcarTodasLasNotificacionesLeidasUseCase.ejecutar).toHaveBeenCalledWith('analista-1');
  });

  test('sin notificaciones pendientes, responde 200 con marcadas: 0', async () => {
    (container.marcarTodasLasNotificacionesLeidasUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(0);

    const res = await conHttps(request(app).patch('/notificaciones/marcar-todas-leidas').set('Authorization', `Bearer ${tokenPara('analista-1')}`));

    expect(res.body).toEqual({ marcadas: 0 });
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).patch('/notificaciones/marcar-todas-leidas'));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /notificaciones — RF-104 (extra: eliminar seleccionadas)', () => {
  test('camino feliz: responde 200 con la cantidad eliminada', async () => {
    (container.eliminarNotificacionesUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(2);

    const res = await conHttps(
      request(app).delete('/notificaciones').set('Authorization', `Bearer ${tokenPara('analista-1')}`).send({ ids: ['n1', 'n2'] })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eliminadas: 2 });
    expect(container.eliminarNotificacionesUseCase.ejecutar).toHaveBeenCalledWith(['n1', 'n2'], 'analista-1');
  });

  test('sin un array de ids responde 400 sin llamar al caso de uso', async () => {
    (container.eliminarNotificacionesUseCase.ejecutar as jest.Mock).mockClear();

    const res = await conHttps(
      request(app).delete('/notificaciones').set('Authorization', `Bearer ${tokenPara('analista-1')}`).send({ ids: 'no-es-un-array' })
    );

    expect(res.status).toBe(400);
    expect(container.eliminarNotificacionesUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('un array con elementos que no son string responde 400', async () => {
    const res = await conHttps(
      request(app).delete('/notificaciones').set('Authorization', `Bearer ${tokenPara('analista-1')}`).send({ ids: ['n1', 42] })
    );

    expect(res.status).toBe(400);
  });

  test('IDOR: ids de otro analista simplemente no se eliminan, sin error distinto (eliminarNotificacionesUseCase ya scopea)', async () => {
    (container.eliminarNotificacionesUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(0);

    const res = await conHttps(
      request(app).delete('/notificaciones').set('Authorization', `Bearer ${tokenPara('analista-2')}`).send({ ids: ['n-de-otro-analista'] })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eliminadas: 0 });
    expect(container.eliminarNotificacionesUseCase.ejecutar).toHaveBeenCalledWith(['n-de-otro-analista'], 'analista-2');
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).delete('/notificaciones').send({ ids: ['n1'] }));
    expect(res.status).toBe(401);
  });
});
