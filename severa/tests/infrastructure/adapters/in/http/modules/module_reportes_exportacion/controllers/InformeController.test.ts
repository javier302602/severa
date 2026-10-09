import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
  container: {
    programarInformePeriodicoUseCase: {
      ejecutar: jest.fn().mockResolvedValue(undefined)
    },
    generarInformeUseCase: {
      ejecutar: jest.fn()
    },
    generarInformeDatasetUseCase: {
      ejecutar: jest.fn()
    }
  }
}));

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../../src/domain/errors/SesionAnalisisNoEncontradaError';

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

// M-10 Ronda 2, Pasada 3: los dos endpoints de informe completo comparten
// parámetros (formato, adjuntarGraficos) y forma de responder.
describe.each([
  ['GET /informes/completo', '/informes/completo', () => container.generarInformeUseCase.ejecutar as jest.Mock, 'informe-siade'],
  ['GET /analisis-datos/:sesionId/informe', '/analisis-datos/sesion-1/informe', () => container.generarInformeDatasetUseCase.ejecutar as jest.Mock, 'informe-analisis-datos']
])('%s (RF-77/78/79/80/132/133)', (_titulo, ruta, obtenerMock, nombreBase) => {
  const token = tokenPara('analista-A');
  const esDataset = ruta.startsWith('/analisis-datos');
  // Los dos casos de uso reciben los mismos datos en distinto orden.
  const argumentos = (formato: string, opciones: object) => (esDataset ? ['analista-A', 'sesion-1', formato, opciones] : [formato, 'analista-A', opciones]);

  afterEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['pdf', 'application/pdf', 'pdf'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['html', 'text/html; charset=utf-8', 'html'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['latex', 'application/zip', 'zip']
  ])('formato %s: sirve el archivo con el tipo y el nombre que informa el generador, como descarga', async (formato, tipoMime, extension) => {
    obtenerMock().mockResolvedValue({ contenido: Buffer.from(`contenido-${formato}`), tipoMime, extension });

    const res = await conHttps(request(app).get(ruta).query({ formato }).set('Authorization', `Bearer ${token}`)).buffer(true).parse((respuesta, callback) => {
      const partes: Buffer[] = [];
      respuesta.on('data', (parte: Buffer) => partes.push(parte));
      respuesta.on('end', () => callback(null, Buffer.concat(partes)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(tipoMime);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${nombreBase}.${extension}"`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect((res.body as Buffer).toString()).toBe(`contenido-${formato}`);
    expect(obtenerMock()).toHaveBeenCalledWith(...argumentos(formato, { adjuntarGraficos: false }));
  });

  test('adjuntarGraficos=true llega al caso de uso (RF-80)', async () => {
    obtenerMock().mockResolvedValue({ contenido: Buffer.from('zip'), tipoMime: 'application/zip', extension: 'zip' });

    const res = await conHttps(request(app).get(ruta).query({ formato: 'pdf', adjuntarGraficos: 'true' }).set('Authorization', `Bearer ${token}`));

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${nombreBase}.zip"`);
    expect(obtenerMock()).toHaveBeenCalledWith(...argumentos('pdf', { adjuntarGraficos: true }));
  });

  test.each([[{}], [{ formato: 'txt' }], [{ formato: 'PDF' }], [{ formato: ['pdf', 'docx'] }]])('formato ausente o desconocido (%j): 400 que lista los formatos válidos, sin generar nada', async (query) => {
    const res = await conHttps(request(app).get(ruta).query(query).set('Authorization', `Bearer ${token}`));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('pdf, docx, html, latex, xlsx');
    expect(obtenerMock()).not.toHaveBeenCalled();
  });

  test('adjuntarGraficos con un valor que no es true/false: 400, no se ignora en silencio', async () => {
    const res = await conHttps(request(app).get(ruta).query({ formato: 'pdf', adjuntarGraficos: 'si' }).set('Authorization', `Bearer ${token}`));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('adjuntarGraficos');
    expect(obtenerMock()).not.toHaveBeenCalled();
  });

  test('sin token: 401, no se genera nada', async () => {
    const res = await conHttps(request(app).get(ruta).query({ formato: 'pdf' }));

    expect(res.status).toBe(401);
    expect(obtenerMock()).not.toHaveBeenCalled();
  });
});

describe('GET /analisis-datos/:sesionId/informe — sesión', () => {
  test('una sesión que no existe o es de otro analista: 404', async () => {
    (container.generarInformeDatasetUseCase.ejecutar as jest.Mock).mockRejectedValue(new SesionAnalisisNoEncontradaError());

    const res = await conHttps(
      request(app).get('/analisis-datos/sesion-ajena/informe').query({ formato: 'html' }).set('Authorization', `Bearer ${tokenPara('analista-A')}`)
    );

    expect(res.status).toBe(404);
  });
});
