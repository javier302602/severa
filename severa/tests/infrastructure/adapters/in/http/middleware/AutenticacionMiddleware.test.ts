import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { autenticacion } from '../../../src/infrastructure/adapters/in/http/middleware/AutenticacionMiddleware';
import { config } from '../../../src/infrastructure/config/env';

function fakeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function fakeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe('autenticacion middleware', () => {
  test('responde 401 si no hay header Authorization', () => {
    const req = fakeReq();
    const res = fakeRes();
    const next = jest.fn();

    autenticacion(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('responde 401 si el header no tiene el formato "Bearer <token>"', () => {
    const req = fakeReq({ authorization: 'Token abc123' });
    const res = fakeRes();
    const next = jest.fn();

    autenticacion(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('responde 401 si el token está firmado con otro secreto', () => {
    const tokenAjeno = jwt.sign({ sub: 'analista-1', rol: 'analista' }, 'secreto-incorrecto');
    const req = fakeReq({ authorization: `Bearer ${tokenAjeno}` });
    const res = fakeRes();
    const next = jest.fn();

    autenticacion(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('responde 401 si el token está expirado', () => {
    const tokenExpirado = jwt.sign({ sub: 'analista-1', rol: 'analista' }, config.jwtSecret, { expiresIn: -10 });
    const req = fakeReq({ authorization: `Bearer ${tokenExpirado}` });
    const res = fakeRes();
    const next = jest.fn();

    autenticacion(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('responde 401 si el rol del payload no es analista ni administrador', () => {
    const tokenRolInvalido = jwt.sign({ sub: 'analista-1', rol: 'superadmin' }, config.jwtSecret);
    const req = fakeReq({ authorization: `Bearer ${tokenRolInvalido}` });
    const res = fakeRes();
    const next = jest.fn();

    autenticacion(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('con un token válido, adjunta analistaAutenticado y llama a next()', () => {
    const token = jwt.sign({ sub: 'analista-1', rol: 'administrador' }, config.jwtSecret);
    const req = fakeReq({ authorization: `Bearer ${token}` });
    const res = fakeRes();
    const next = jest.fn();

    autenticacion(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.analistaAutenticado).toEqual({ id: 'analista-1', rol: 'administrador' });
    expect(res.status).not.toHaveBeenCalled();
  });
});
