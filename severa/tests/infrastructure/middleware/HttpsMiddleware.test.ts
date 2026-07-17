import { Request, Response } from 'express';
import { exigirHttps } from '../../../src/infrastructure/adapters/in/http/middleware/HttpsMiddleware';

function fakeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function fakeReq(opts: { secure?: boolean; xForwardedProto?: string } = {}): Request {
  return {
    secure: opts.secure ?? false,
    headers: opts.xForwardedProto ? { 'x-forwarded-proto': opts.xForwardedProto } : {}
  } as unknown as Request;
}

describe('exigirHttps middleware', () => {
  test('en development permite HTTP sin más chequeo', () => {
    const req = fakeReq({ secure: false });
    const res = fakeRes();
    const next = jest.fn();

    exigirHttps('development')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('fuera de development, rechaza con 403 si la conexión no es segura', () => {
    const req = fakeReq({ secure: false });
    const res = fakeRes();
    const next = jest.fn();

    exigirHttps('production')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('fuera de development, permite si req.secure es true', () => {
    const req = fakeReq({ secure: true });
    const res = fakeRes();
    const next = jest.fn();

    exigirHttps('production')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('fuera de development, permite si x-forwarded-proto es https (terminación TLS en un proxy)', () => {
    const req = fakeReq({ secure: false, xForwardedProto: 'https' });
    const res = fakeRes();
    const next = jest.fn();

    exigirHttps('production')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
