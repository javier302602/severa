import { Request, Response } from 'express';
import { requiereRol } from '../../../src/infrastructure/adapters/in/http/middleware/RolMiddleware';

function fakeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function fakeReq(analistaAutenticado?: { id: string; rol: 'analista' | 'administrador' }): Request {
  return { analistaAutenticado } as unknown as Request;
}

describe('requiereRol middleware', () => {
  test('responde 403 si no hay analistaAutenticado (no debería pasar si se monta después de `autenticacion`, pero es defensivo)', () => {
    const req = fakeReq(undefined);
    const res = fakeRes();
    const next = jest.fn();

    requiereRol('administrador')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('responde 403 si el rol del analista no está entre los permitidos', () => {
    const req = fakeReq({ id: 'analista-1', rol: 'analista' });
    const res = fakeRes();
    const next = jest.fn();

    requiereRol('administrador')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('llama a next() si el rol está entre los permitidos', () => {
    const req = fakeReq({ id: 'admin-1', rol: 'administrador' });
    const res = fakeRes();
    const next = jest.fn();

    requiereRol('administrador')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('acepta múltiples roles permitidos', () => {
    const req = fakeReq({ id: 'analista-1', rol: 'analista' });
    const res = fakeRes();
    const next = jest.fn();

    requiereRol('analista', 'administrador')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
