import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    consultarAuditoriaUseCase: {
      ejecutar: jest.fn()
    }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';
import { RegistroAuditoria } from '../../../../../../../../src/domain/entities/RegistroAuditoria';

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function tokenPara(sub: string, rol: 'analista' | 'administrador'): string {
  return jwt.sign({ sub, rol }, config.jwtSecret, { expiresIn: '1h' });
}

describe('GET /auditoria — RF-91/94/95', () => {
  test('camino feliz: un administrador ve el historial completo', async () => {
    const registros = [
      new RegistroAuditoria('a1', 'analista-1', 'ImportarDataset', '10 importados, 0 rechazados', new Date('2026-01-01'), '127.0.0.1'),
      new RegistroAuditoria('a2', 'analista-2', 'GenerarInforme', 'Informe completo (pdf)', new Date('2026-01-02'), null)
    ];
    (container.consultarAuditoriaUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(registros);

    const res = await conHttps(request(app).get('/auditoria').set('Authorization', `Bearer ${tokenPara('admin-1', 'administrador')}`));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'a1',
        usuario: 'analista-1',
        accion: 'ImportarDataset',
        detalle: '10 importados, 0 rechazados',
        fechaHora: '2026-01-01T00:00:00.000Z',
        ip: '127.0.0.1',
        datasetId: null
      },
      { id: 'a2', usuario: 'analista-2', accion: 'GenerarInforme', detalle: 'Informe completo (pdf)', fechaHora: '2026-01-02T00:00:00.000Z', ip: null, datasetId: null }
    ]);
    // Sin ?datasetId: el historial completo, sin filtro.
    expect(container.consultarAuditoriaUseCase.ejecutar).toHaveBeenLastCalledWith({});
  });

  // RF-138: "el administrador puede consultar la auditoría completa de un
  // dataset específico".
  test('RF-138: con ?datasetId pide solo la auditoría de ese dataset y la devuelve con su datasetId', async () => {
    const registros = [
      new RegistroAuditoria('a3', 'analista-1', 'LimpiarDatasetGenerico', 'Limpieza de "ventas.xlsx"', new Date('2026-02-01'), null, 'dataset-9')
    ];
    (container.consultarAuditoriaUseCase.ejecutar as jest.Mock).mockResolvedValueOnce(registros);

    const res = await conHttps(
      request(app).get('/auditoria').query({ datasetId: ' dataset-9 ' }).set('Authorization', `Bearer ${tokenPara('admin-1', 'administrador')}`)
    );

    expect(res.status).toBe(200);
    expect(container.consultarAuditoriaUseCase.ejecutar).toHaveBeenLastCalledWith({ datasetId: 'dataset-9' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ accion: 'LimpiarDatasetGenerico', datasetId: 'dataset-9' });
  });

  test.each([
    ['vacío', '/auditoria?datasetId='],
    ['repetido', '/auditoria?datasetId=a&datasetId=b']
  ])('RF-138: un datasetId %s responde 400 en vez de ignorar el filtro y devolver todo', async (_caso, url) => {
    (container.consultarAuditoriaUseCase.ejecutar as jest.Mock).mockClear();

    const res = await conHttps(request(app).get(url).set('Authorization', `Bearer ${tokenPara('admin-1', 'administrador')}`));

    expect(res.status).toBe(400);
    expect(container.consultarAuditoriaUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('RF-138: el filtro por dataset también es solo para administradores', async () => {
    (container.consultarAuditoriaUseCase.ejecutar as jest.Mock).mockClear();

    const res = await conHttps(
      request(app).get('/auditoria').query({ datasetId: 'dataset-9' }).set('Authorization', `Bearer ${tokenPara('analista-1', 'analista')}`)
    );

    expect(res.status).toBe(403);
    expect(container.consultarAuditoriaUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('un analista sin rol administrador recibe 403, no la lista', async () => {
    (container.consultarAuditoriaUseCase.ejecutar as jest.Mock).mockClear();

    const res = await conHttps(request(app).get('/auditoria').set('Authorization', `Bearer ${tokenPara('analista-1', 'analista')}`));

    expect(res.status).toBe(403);
    expect(container.consultarAuditoriaUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).get('/auditoria'));
    expect(res.status).toBe(401);
  });
});
