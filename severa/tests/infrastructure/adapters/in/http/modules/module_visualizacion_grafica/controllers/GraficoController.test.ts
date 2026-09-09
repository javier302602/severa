import request from 'supertest';
import jwt from 'jsonwebtoken';

import { VariableDeConsultaInvalidaError } from '../../../../../../../../src/domain/errors/VariableDeConsultaInvalidaError';

jest.mock('../../../../../../../../src/infrastructure/config/container', () => ({
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

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';

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

// M-07 (retoma, RF-51/52/53/56/57): el controller reenvía `variable`/
// `variableAgrupacion`/`variableValor` tal cual (strings crudos, sin
// validar acá) — la validación vive en GenerarGrafico.ts (ver su propia
// suite de tests), este archivo solo confirma el passthrough y que un error
// del caso de uso cae en el mismo catch 400 de siempre.
describe('GraficoController — M-07 retoma: passthrough de variable/variableAgrupacion/variableValor', () => {
  const token = tokenPara('analista-A');

  test('?variable=diasParaParche se reenvía tal cual en opciones', async () => {
    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss?variable=diasParaParche').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    const container = jest.requireMock('../../../../../../../../src/infrastructure/config/container').container;
    expect(container.generarGraficoUseCase.ejecutar).toHaveBeenCalledWith(
      'histogramaCvss',
      'analista-A',
      expect.objectContaining({ variable: 'diasParaParche' })
    );
  });

  test('?variableAgrupacion=estadoRemediacion&variableValor=diasParaParche se reenvían tal cual', async () => {
    const res = await conHttps(
      request(app)
        .get('/graficos/cvssPorAcceso?variableAgrupacion=estadoRemediacion&variableValor=diasParaParche')
        .set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    const container = jest.requireMock('../../../../../../../../src/infrastructure/config/container').container;
    expect(container.generarGraficoUseCase.ejecutar).toHaveBeenCalledWith(
      'cvssPorAcceso',
      'analista-A',
      expect.objectContaining({ variableAgrupacion: 'estadoRemediacion', variableValor: 'diasParaParche' })
    );
  });

  test('sin esos query params, se reenvían como undefined (RETROCOMPATIBILIDAD)', async () => {
    await conHttps(request(app).get('/graficos/histogramaCvss').set('Authorization', `Bearer ${token}`));

    const container = jest.requireMock('../../../../../../../../src/infrastructure/config/container').container;
    expect(container.generarGraficoUseCase.ejecutar).toHaveBeenCalledWith(
      'histogramaCvss',
      'analista-A',
      expect.objectContaining({ variable: undefined, variableAgrupacion: undefined, variableValor: undefined })
    );
  });

  test('variable inválida: el caso de uso tira VariableDeConsultaInvalidaError y el controller responde 400 (mismo catch de siempre)', async () => {
    const container = jest.requireMock('../../../../../../../../src/infrastructure/config/container').container;
    (container.generarGraficoUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(
      new VariableDeConsultaInvalidaError('"noExiste" no es una variable numérica válida (cvssScore, diasParaParche)')
    );

    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss?variable=noExiste').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no es una variable numérica válida');
  });
});
