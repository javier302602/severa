import request from 'supertest';
import jwt from 'jsonwebtoken';

// Mismo criterio que VulnerabilidadController.test.ts/CuentaController.test.ts:
// usa las clases REALES de los 4 casos de uso (no un mock del caso de uso),
// solo se reemplaza el repositorio — así se prueba la cadena completa HTTP ->
// controller -> caso de uso -> ComparadorDeCategorias (M-06) real.
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { CompararPorTipoAcceso } = require('../../../../../../../../src/application/usecases/module_comparacion_categorias/CompararPorTipoAcceso');
  const { CompararPorSoftware } = require('../../../../../../../../src/application/usecases/module_comparacion_categorias/CompararPorSoftware');
  const { CompararPorTipoDeVulnerabilidad } = require('../../../../../../../../src/application/usecases/module_comparacion_categorias/CompararPorTipoDeVulnerabilidad');
  const { ListarSoftwareDisponible } = require('../../../../../../../../src/application/usecases/module_comparacion_categorias/ListarSoftwareDisponible');
  const { Vulnerabilidad } = require('../../../../../../../../src/domain/entities/Vulnerabilidad');
  const { IdentificadorCVE } = require('../../../../../../../../src/domain/shared/value-objects/IdentificadorCVE');
  const { CvssScore } = require('../../../../../../../../src/domain/shared/value-objects/CvssScore');
  const { TipoAccesoValue } = require('../../../../../../../../src/domain/shared/value-objects/TipoAcceso');

  // Dos analistas con catálogos distintos, mismo nombre de software y mismo
  // tipo de acceso, CVSS diferentes — para el test de scoping/multi-tenancy.
  const catalogoPorAnalista: Record<string, InstanceType<typeof Vulnerabilidad>[]> = {
    'analista-comparacion-A': [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE')
    ],
    'analista-comparacion-B': [
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2014-0160'), new CvssScore(2.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'DoS'),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(1.5), 'Nginx', new TipoAccesoValue('No'), undefined, 'Nginx', 'DoS')
    ]
  };

  const repository = {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn(),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    listarPorTipoAcceso: jest.fn(async (tipoAcceso: 'Remoto' | 'Local', analistaId: string) =>
      (catalogoPorAnalista[analistaId] ?? []).filter((item) => item.tipoAcceso?.valor === tipoAcceso)
    ),
    listarPorTipoVulnerabilidad: jest.fn(async (tipo: string, analistaId: string) =>
      (catalogoPorAnalista[analistaId] ?? []).filter((item) => item.tipoVulnerabilidad === tipo)
    ),
    listarSoftwareDisponible: jest.fn(async (analistaId: string) => [
      ...new Set((catalogoPorAnalista[analistaId] ?? []).map((item) => item.software))
    ]),
    listarPorSoftware: jest.fn(async (software: string, analistaId: string) =>
      (catalogoPorAnalista[analistaId] ?? []).filter((item) => item.software.toLowerCase().includes(software.toLowerCase()))
    ),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };

  return {
    container: {
      compararPorTipoAccesoUseCase: new CompararPorTipoAcceso(repository),
      compararPorSoftwareUseCase: new CompararPorSoftware(repository),
      compararPorTipoDeVulnerabilidadUseCase: new CompararPorTipoDeVulnerabilidad(repository),
      listarSoftwareDisponibleUseCase: new ListarSoftwareDisponible(repository)
    }
  };
});

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';

const app = createApp();

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function conToken(sub: string): (req: request.Test) => request.Test {
  return (req) => {
    const token = jwt.sign({ sub, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
    return req.set('Authorization', `Bearer ${token}`);
  };
}

describe('GET /comparacion/acceso — RF-62/63/68', () => {
  test('compara CVSS promedio Remoto vs Local del propio catálogo, con categoriaConMayorPromedio', async () => {
    const res = await conToken('analista-comparacion-A')(conHttps(request(app).get('/comparacion/acceso')));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mediaA: 10, mediaB: 9.8, categoriaConMayorPromedio: 'Remoto' });
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/comparacion/acceso'));
    expect(res.status).toBe(401);
  });
});

describe('GET /comparacion/tipo — RF-62/63/68', () => {
  test('compara CVSS promedio entre dos tipos de vulnerabilidad reales', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/tipo').query({ categoriaA: 'Log4Shell', categoriaB: 'RCE' }))
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mediaA: 10, mediaB: 9.8, categoriaConMayorPromedio: 'Log4Shell' });
  });

  test('sin query params, usa el default N/A vs N/A (ninguna vulnerabilidad, todo en null)', async () => {
    const res = await conToken('analista-comparacion-A')(conHttps(request(app).get('/comparacion/tipo')));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mediaA: null, mediaB: null, categoriaConMayorPromedio: null });
  });
});

describe('GET /comparacion/software — RF-62/63/68', () => {
  test('compara CVSS promedio entre dos software reales', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/software').query({ categoriaA: 'Apache Log4j', categoriaB: 'OpenSSL' }))
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mediaA: 10, mediaB: 9.8, categoriaConMayorPromedio: 'Apache Log4j' });
  });
});

describe('GET /comparacion/software-disponible — scoping/multi-tenancy', () => {
  test('devuelve solo el software del propio catálogo del analista', async () => {
    const res = await conToken('analista-comparacion-A')(conHttps(request(app).get('/comparacion/software-disponible')));

    expect(res.status).toBe(200);
    expect(res.body.sort()).toEqual(['Apache Log4j', 'OpenSSL']);
  });

  test('un analista distinto, con catálogo distinto, no ve el software del otro', async () => {
    const res = await conToken('analista-comparacion-B')(conHttps(request(app).get('/comparacion/software-disponible')));

    expect(res.status).toBe(200);
    expect(res.body.sort()).toEqual(['Apache Log4j', 'Nginx']);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/comparacion/software-disponible'));
    expect(res.status).toBe(401);
  });
});

describe('Scoping — mismo nombre de software, catálogos distintos por analista', () => {
  test('analista A y analista B, comparando el mismo software, obtienen resultados de su propio catálogo, no del otro', async () => {
    const resA = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/software').query({ categoriaA: 'Apache Log4j', categoriaB: 'Nginx' }))
    );
    const resB = await conToken('analista-comparacion-B')(
      conHttps(request(app).get('/comparacion/software').query({ categoriaA: 'Apache Log4j', categoriaB: 'Nginx' }))
    );

    expect(resA.body.mediaA).toBe(10); // CVSS 10.0 de analista A
    expect(resB.body.mediaA).toBe(2); // CVSS 2.0 de analista B — nunca el 10.0 de A
  });
});
