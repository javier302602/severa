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
      // Misma firma que el caso de uso real: (tipo, analistaId, opciones). El
      // mock anterior leía `formato` del segundo argumento (el id del
      // analista), así que siempre respondía como si se hubiera pedido svg.
      ejecutar: jest.fn(async (_tipo: string, _analistaId: string, opciones: { formato?: string }) => {
        if (opciones.formato === 'json') return { tipo: 'histograma', datos: [] };
        if (opciones.formato === 'png' || opciones.formato === 'pdf') return Buffer.from(`archivo-${opciones.formato}`);
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

describe('GraficoController — formatos de salida (RF-61)', () => {
  const token = tokenPara('analista-A');

  test.each([
    ['png', 'image/png'],
    ['pdf', 'application/pdf']
  ])('?formato=%s: sirve el archivo binario con su tipo real y como descarga con nombre', async (formato, tipoMime) => {
    const res = await conHttps(
      request(app).get(`/graficos/histogramaCvss?formato=${formato}`).set('Authorization', `Bearer ${token}`)
    )
      .buffer(true)
      .parse((respuesta, callback) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => callback(null, Buffer.concat(partes)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(tipoMime);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="histogramaCvss.${formato}"`);
    expect((res.body as Buffer).toString()).toBe(`archivo-${formato}`);
    // El aviso de "se pidió png pero se entregó svg" ya no existe: se entrega lo pedido.
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

  test('?formato=json devuelve JSON', async () => {
    const res = await conHttps(
      request(app).get('/graficos/histogramaCvss?formato=json').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ tipo: 'histograma', datos: [] });
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
