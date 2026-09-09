import request from 'supertest';
import jwt from 'jsonwebtoken';

const FECHA_CARGA = new Date('2024-01-15T00:00:00Z');

jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { Vulnerabilidad } = require('../../../../../../../../src/domain/entities/Vulnerabilidad');
  const { IdentificadorCVE } = require('../../../../../../../../src/domain/shared/value-objects/IdentificadorCVE');
  const { CvssScore } = require('../../../../../../../../src/domain/shared/value-objects/CvssScore');
  const { TipoAccesoValue } = require('../../../../../../../../src/domain/shared/value-objects/TipoAcceso');
  const { EstadoRemediacionValue } = require('../../../../../../../../src/domain/shared/value-objects/EstadoRemediacion');

  const vulnerabilidadCompleta = new Vulnerabilidad(
    '1',
    new IdentificadorCVE('CVE-2021-44228'),
    new CvssScore(10.0),
    'Apache Log4j',
    new TipoAccesoValue('Sí'),
    5,
    'Apache Log4j',
    'Code Injection',
    new EstadoRemediacionValue('Pendiente').transicionarA('EnProceso'),
    FECHA_CARGA,
    undefined
  );

  const vulnerabilidadRango = new Vulnerabilidad(
    '2',
    new IdentificadorCVE('CVE-2022-00001'),
    new CvssScore(8.5),
    'Nginx',
    new TipoAccesoValue('Sí')
  );
  const vulnerabilidadCategoria = new Vulnerabilidad(
    '3',
    new IdentificadorCVE('CVE-2022-00002'),
    new CvssScore(9.8),
    'OpenSSL',
    new TipoAccesoValue('Sí')
  );

  return {
    container: {
      consultarVulnerabilidadPorCveUseCase: {
        ejecutar: jest.fn(async (cve: string) => (cve === 'CVE-2021-44228' ? vulnerabilidadCompleta : null))
      },
      filtrarPorRangoDeVariableUseCase: {
        ejecutar: jest.fn().mockResolvedValue([vulnerabilidadRango])
      },
      filtrarPorCategoriaClasificacionUseCase: {
        ejecutar: jest.fn().mockResolvedValue([vulnerabilidadCategoria])
      }
    }
  };
});

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

describe('GET /vulnerabilidades/:cve — RF (Sprint 17)', () => {
  test('la respuesta incluye estadoRemediacion, tipoVulnerabilidad, diasParaParche y fechaCarga (antes se perdían acá)', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades/CVE-2021-44228')));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: '1',
      cve: 'CVE-2021-44228',
      software: 'Apache Log4j',
      cvssScore: 10,
      tipoAcceso: 'Remoto',
      tipoVulnerabilidad: 'Code Injection',
      diasParaParche: 5,
      estadoRemediacion: 'EnProceso',
      fechaRemediacion: null
    });
    expect(new Date(res.body.fechaCarga)).toEqual(FECHA_CARGA);
  });

  // RF-25/RF-30 (M-04, retoma): envelope genérico ADITIVO — los campos
  // concretos de arriba (cvssScore, tipoAcceso, ...) siguen ahí sin cambios
  // (verificado por el test anterior), esto solo confirma que la vista
  // generalizada se suma en la misma respuesta.
  test('RF-25/RF-30: suma variableClasificacion y variableAgrupacion sin quitar los campos concretos', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades/CVE-2021-44228')));

    expect(res.status).toBe(200);
    expect(res.body.variableClasificacion).toEqual({ variable: 'cvssScore', valor: 10 });
    expect(res.body.variableAgrupacion).toEqual({ variable: 'tipoAcceso', valor: 'Remoto' });
    // Los campos de siempre no desaparecieron.
    expect(res.body.cvssScore).toBe(10);
    expect(res.body.tipoAcceso).toBe('Remoto');
  });

  test('404 cuando el CVE no existe, sin filtrar campos internos', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades/CVE-9999-99999')));

    expect(res.status).toBe(404);
  });
});

// RF-27/RF-28 (M-04, retoma): generalizado de verdad — `variable` elige
// entre las variables numéricas/categóricas existentes (ver
// VariablesVulnerabilidad.ts). Retrocompatibilidad explícita: una URL sin
// `variable` (como las que ya usan las llamadas existentes y los filtros
// favoritos guardados en M-11) debe delegar exactamente con el default de
// siempre, sin que el analista tenga que enterarse de que el mecanismo
// cambió por dentro.
describe('GET /vulnerabilidades — filtro por rango (RF-27) y por categoría (RF-28)', () => {
  test('RETROCOMPATIBILIDAD: sin variable, cvssMin/cvssMax delega igual que antes (default cvssScore)', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades').query({ cvssMin: 7, cvssMax: 10 })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ cve: 'CVE-2022-00001', cvssScore: 8.5, software: 'Nginx' }]);
    expect(container.filtrarPorRangoDeVariableUseCase.ejecutar).toHaveBeenCalledWith(7, 10, 'analista-1', 'cvssScore');
  });

  test('RETROCOMPATIBILIDAD: sin variable, severidad delega igual que antes (default severidad)', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades').query({ severidad: 'Crítica' })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ cve: 'CVE-2022-00002', cvssScore: 9.8, software: 'OpenSSL' }]);
    expect(container.filtrarPorCategoriaClasificacionUseCase.ejecutar).toHaveBeenCalledWith('Crítica', 'analista-1', 'severidad');
  });

  test('con variable=diasParaParche explícito, se pasa esa variable en vez del default', async () => {
    const res = await conToken(
      conHttps(request(app).get('/vulnerabilidades').query({ cvssMin: 1, cvssMax: 30, variable: 'diasParaParche' }))
    );

    expect(res.status).toBe(200);
    expect(container.filtrarPorRangoDeVariableUseCase.ejecutar).toHaveBeenCalledWith(1, 30, 'analista-1', 'diasParaParche');
  });

  test('con variable=tipoAcceso explícito para categoría, se pasa esa variable en vez del default', async () => {
    const res = await conToken(
      conHttps(request(app).get('/vulnerabilidades').query({ severidad: 'Remoto', variable: 'tipoAcceso' }))
    );

    expect(res.status).toBe(200);
    expect(container.filtrarPorCategoriaClasificacionUseCase.ejecutar).toHaveBeenCalledWith('Remoto', 'analista-1', 'tipoAcceso');
  });

  test('variable inválida para rango responde 400 sin llamar al caso de uso', async () => {
    const llamadasPrevias = (container.filtrarPorRangoDeVariableUseCase.ejecutar as jest.Mock).mock.calls.length;

    const res = await conToken(
      conHttps(request(app).get('/vulnerabilidades').query({ cvssMin: 1, cvssMax: 10, variable: 'noExiste' }))
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('noExiste');
    expect((container.filtrarPorRangoDeVariableUseCase.ejecutar as jest.Mock).mock.calls.length).toBe(llamadasPrevias);
  });

  test('variable inválida para categoría responde 400 sin llamar al caso de uso', async () => {
    const llamadasPrevias = (container.filtrarPorCategoriaClasificacionUseCase.ejecutar as jest.Mock).mock.calls.length;

    const res = await conToken(
      conHttps(request(app).get('/vulnerabilidades').query({ severidad: 'Alta', variable: 'noExiste' }))
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('noExiste');
    expect((container.filtrarPorCategoriaClasificacionUseCase.ejecutar as jest.Mock).mock.calls.length).toBe(llamadasPrevias);
  });

  test('sin ningún filtro, responde un array vacío sin llamar a ningún caso de uso de filtro', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('rango tiene prioridad sobre severidad si ambos vienen en la query', async () => {
    // No se usa not.toHaveBeenCalled() acá: el mock del container se crea una
    // sola vez para todo el archivo (sin clearMocks en jest.config), así que
    // filtrarPorCategoriaClasificacionUseCase.ejecutar ya fue llamado por el
    // test anterior — la prioridad se verifica por el cuerpo de la respuesta
    // (el resultado es el del filtro por rango, no el de categoría).
    const res = await conToken(
      conHttps(request(app).get('/vulnerabilidades').query({ cvssMin: 7, cvssMax: 10, severidad: 'Crítica' }))
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ cve: 'CVE-2022-00001', cvssScore: 8.5, software: 'Nginx' }]);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/vulnerabilidades'));
    expect(res.status).toBe(401);
  });
});
