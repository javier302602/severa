import request from 'supertest';
import jwt from 'jsonwebtoken';

const FECHA_CARGA = new Date('2024-01-15T00:00:00Z');

jest.mock('../../src/infrastructure/config/container', () => {
  const { Vulnerabilidad } = require('../../src/domain/entities/Vulnerabilidad');
  const { IdentificadorCVE } = require('../../src/domain/value-objects/IdentificadorCVE');
  const { CvssScore } = require('../../src/domain/value-objects/CvssScore');
  const { TipoAccesoValue } = require('../../src/domain/value-objects/TipoAcceso');
  const { EstadoRemediacionValue } = require('../../src/domain/value-objects/EstadoRemediacion');

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

  return {
    container: {
      consultarVulnerabilidadPorCveUseCase: {
        ejecutar: jest.fn(async (cve: string) => (cve === 'CVE-2021-44228' ? vulnerabilidadCompleta : null))
      }
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
