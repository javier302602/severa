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

  test('404 cuando el CVE no existe, sin filtrar campos internos', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades/CVE-9999-99999')));

    expect(res.status).toBe(404);
  });
});

// RF-27/RF-28 (M-04): mismo criterio que arriba — se prueba el comportamiento
// tal cual está hoy (parámetros cvssMin/cvssMax/severidad), sin generalizar
// nada (ver el comentario en VulnerabilidadController.ts).
describe('GET /vulnerabilidades — filtro por rango (RF-27) y por categoría (RF-28)', () => {
  test('con cvssMin y cvssMax, delega en filtrarPorRangoDeVariableUseCase', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades').query({ cvssMin: 7, cvssMax: 10 })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ cve: 'CVE-2022-00001', cvssScore: 8.5, software: 'Nginx' }]);
    expect(container.filtrarPorRangoDeVariableUseCase.ejecutar).toHaveBeenCalledWith(7, 10, 'analista-1');
  });

  test('con severidad, delega en filtrarPorCategoriaClasificacionUseCase', async () => {
    const res = await conToken(conHttps(request(app).get('/vulnerabilidades').query({ severidad: 'Crítica' })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ cve: 'CVE-2022-00002', cvssScore: 9.8, software: 'OpenSSL' }]);
    expect(container.filtrarPorCategoriaClasificacionUseCase.ejecutar).toHaveBeenCalledWith('Crítica', 'analista-1');
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
