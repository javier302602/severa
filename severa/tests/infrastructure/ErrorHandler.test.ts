import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import type { GraficosOutputPort } from '../../src/application/ports/out/GraficosOutputPort';

// Bug real de Sprint 15: con el catálogo vacío (antes de importar cualquier
// dataset), varios endpoints lanzaban ValorEstadisticoError sin capturar y
// CRASHEABAN EL PROCESO de Node entero (confirmado contra el backend real
// corriendo en Docker: el contenedor se reinició solo). Estos tests usan los
// casos de uso REALES (no mocks) contra un repositorio vacío para probar que
// el error-handler global de app.ts efectivamente evita el crash y devuelve
// un 400 JSON — no alcanza con probar que "algo" atrapa el error, hay que
// probar que la app entera se queda de pie.
function repositorioVacio(): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([])
  };
}

function graficosOutputPortFalso(): GraficosOutputPort {
  return {
    renderizarHistograma: jest.fn().mockResolvedValue('<svg/>'),
    renderizarBarras: jest.fn().mockResolvedValue('<svg/>'),
    renderizarPastel: jest.fn().mockResolvedValue('<svg/>'),
    renderizarBoxplot: jest.fn().mockResolvedValue('<svg/>'),
    renderizarDispersion: jest.fn().mockResolvedValue('<svg/>'),
    renderizarBarrasHorizontales: jest.fn().mockResolvedValue('<svg/>')
  };
}

jest.mock('../../src/infrastructure/config/container', () => {
  const { CalcularResumenEstadistico } = require('../../src/application/usecases/CalcularResumenEstadistico');
  const { GenerarDistribucionFrecuencias } = require('../../src/application/usecases/GenerarDistribucionFrecuencias');
  const { GenerarGrafico } = require('../../src/application/usecases/GenerarGrafico');

  const vulnerabilidadRepository = repositorioVacio();
  const graficosOutputPort = graficosOutputPortFalso();

  return {
    container: {
      calcularResumenEstadisticoUseCase: new CalcularResumenEstadistico(vulnerabilidadRepository),
      generarDistribucionFrecuenciasUseCase: new GenerarDistribucionFrecuencias(vulnerabilidadRepository),
      generarGraficoUseCase: new GenerarGrafico(vulnerabilidadRepository, graficosOutputPort)
    }
  };
});

import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function conToken(req: request.Test): request.Test {
  const token = jwt.sign({ sub: 'analista-1', rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
  return req.set('Authorization', `Bearer ${token}`);
}

describe('Error-handler global — bug del catálogo vacío (Sprint 15)', () => {
  test('GET /estadistica/resumen con catálogo vacío responde 400 JSON, no crashea', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/resumen')));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no puede estar vacía');
  });

  test('GET /estadistica/frecuencias?tipo=agrupada con catálogo vacío responde 400 JSON', async () => {
    const res = await conToken(conHttps(request(app).get('/estadistica/frecuencias?tipo=agrupada')));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no puede estar vacía');
  });

  test('GET /graficos/histogramaCvssAgrupado con catálogo vacío responde 400 JSON (los otros 9 tipos ya toleraban vacío)', async () => {
    const res = await conToken(conHttps(request(app).get('/graficos/histogramaCvssAgrupado')));

    expect(res.status).toBe(400);
  });

  test('la app sigue respondiendo con normalidad después de un error no capturado (el proceso no se cayó)', async () => {
    await conToken(conHttps(request(app).get('/estadistica/resumen')));

    const salud = await conHttps(request(app).get('/health'));
    expect(salud.status).toBe(200);
  });
});
