import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../src/infrastructure/config/container', () => ({
  container: {
    generarGraficoUseCase: {
      // 'svg' (formato real que usa GraficosPage.tsx) devuelve
      // { svg, interpretacion } desde GenerarGrafico.ts — mismo mock que la
      // forma real, no la vieja (string crudo), para que este test siga
      // probando el contrato verdadero.
      ejecutar: jest.fn(async (_tipo: string, opciones: { formato?: string }) => {
        if (opciones.formato === 'json') return { tipo: 'histograma', datos: [] };
        if (opciones.formato === 'png' || opciones.formato === 'pdf') return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', interpretacion: 'Texto de análisis de prueba.' };
      })
    }
  }
}));

import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';

const app = createApp();

function tokenPara(id: string, rol: 'analista' | 'administrador' = 'analista'): string {
  return jwt.sign({ sub: id, rol }, config.jwtSecret, { expiresIn: '1h' });
}

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

describe('GraficoController — header X-Formato-Real (RF-61)', () => {
  const token = tokenPara('analista-A');

  test.each(['png', 'pdf'])('?formato=%s trae X-Formato-Real: svg porque la conversión no está implementada', async (formato) => {
    const res = await conHttps(
      request(app).get(`/graficos/histogramaCvss?formato=${formato}`).set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['x-formato-real']).toBe('svg');
    expect(res.headers['content-type']).toContain('image/svg+xml');
  });

  test('sin query param "formato" (svg por defecto) NO trae X-Formato-Real: lo pedido y lo entregado ya coinciden', async () => {
    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['x-formato-real']).toBeUndefined();
  });

  test('?formato=svg explícito tampoco trae X-Formato-Real', async () => {
    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss?formato=svg').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['x-formato-real']).toBeUndefined();
  });

  test('formato svg (por defecto) devuelve JSON con { svg, interpretacion }, no el SVG crudo como body', async () => {
    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.svg).toContain('<svg');
    expect(res.body.interpretacion).toBe('Texto de análisis de prueba.');
  });

  test('?formato=json tampoco trae X-Formato-Real (json sí se entrega tal cual se pide)', async () => {
    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss?formato=json').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['x-formato-real']).toBeUndefined();
  });
});
