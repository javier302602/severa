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
    },
    exportarDistribucionFrecuenciasUseCase: {
      ejecutar: jest.fn().mockResolvedValue(Buffer.from('xlsx-falso'))
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
  // M-05 (retoma, RF-33): RETROCOMPATIBILIDAD explícita — sin `variable` en
  // la query, se sigue delegando con el 5to argumento en `undefined` (el
  // caso de uso resuelve el default 'cvssScore' internamente), byte a byte
  // igual que antes de esta ronda.
  test('RETROCOMPATIBILIDAD: tipo=sinAgrupar sin variable delega igual que antes', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias').query({ tipo: 'sinAgrupar' })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ valor: 9.8, frecuencia: 1 }]);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith(
      'sinAgrupar',
      'analista-1',
      undefined,
      undefined,
      undefined
    );
  });

  test('RETROCOMPATIBILIDAD: sin tipo, usa sinAgrupar por defecto', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias')));

    expect(res.status).toBe(200);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith(
      'sinAgrupar',
      'analista-1',
      undefined,
      undefined,
      undefined
    );
  });

  test('RETROCOMPATIBILIDAD: tipo=agrupada con numeroDeIntervalos manual, sin variable, delega igual que antes', async () => {
    const res = await conToken(
      conHttps(request(app).get('/estadistica/frecuencias').query({ tipo: 'agrupada', numeroDeIntervalos: 2 }))
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ intervalo: '[0-2)' }, { intervalo: '[2-4)' }]);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith(
      'agrupada',
      'analista-1',
      undefined,
      2,
      undefined
    );
  });

  test('con variable=diasParaParche explícito, se pasa esa variable al caso de uso', async () => {
    const res = await conToken(
      conHttps(request(app).get('/estadistica/frecuencias').query({ tipo: 'agrupada', variable: 'diasParaParche' }))
    );

    expect(res.status).toBe(200);
    expect(container.generarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith(
      'agrupada',
      'analista-1',
      undefined,
      undefined,
      'diasParaParche'
    );
  });

  test('variable inválida responde 400 sin llamar al caso de uso (propagado por el error-handler global)', async () => {
    const llamadasPrevias = (container.generarDistribucionFrecuenciasUseCase.ejecutar as jest.Mock).mock.calls.length;

    const res = await conToken(
      conHttps(request(app).get('/estadistica/frecuencias').query({ variable: 'noExiste' }))
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('noExiste');
    expect((container.generarDistribucionFrecuenciasUseCase.ejecutar as jest.Mock).mock.calls.length).toBe(llamadasPrevias);
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

describe('GET /estadistica/frecuencias/exportar — RF-38', () => {
  afterEach(() => jest.clearAllMocks());

  test('sirve el .xlsx como descarga, con los mismos parámetros que la tabla en pantalla', async () => {
    const res = await conToken(
      conHttps(request(app).get('/estadistica/frecuencias/exportar').query({ tipo: 'agrupada', numeroDeIntervalos: '8', variable: 'diasParaParche' }))
    )
      .buffer(true)
      .parse((respuesta, callback) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => callback(null, Buffer.concat(partes)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename="distribucion-de-frecuencias.xlsx"');
    expect((res.body as Buffer).toString()).toBe('xlsx-falso');
    expect(container.exportarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith('agrupada', 'analista-1', 8, 'diasParaParche');
  });

  test('sin parámetros: la tabla por defecto (sin agrupar, CVSS)', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias/exportar')));

    expect(res.status).toBe(200);
    expect(container.exportarDistribucionFrecuenciasUseCase.ejecutar).toHaveBeenCalledWith('sinAgrupar', 'analista-1', undefined, undefined);
  });

  test('variable inválida: 400, igual que la ruta de consulta, sin exportar nada', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias/exportar').query({ variable: 'software' })));

    expect(res.status).toBe(400);
    expect(container.exportarDistribucionFrecuenciasUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('sin token: 401', async () => {
    const res = await conHttps(request(app).get('/estadistica/frecuencias/exportar'));

    expect(res.status).toBe(401);
  });
});
