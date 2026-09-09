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
  const { CompararPorCategoria } = require('../../../../../../../../src/application/usecases/module_comparacion_categorias/CompararPorCategoria');
  const { CompararPorCategoriasCruzadas } = require('../../../../../../../../src/application/usecases/module_comparacion_categorias/CompararPorCategoriasCruzadas');
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
    listar: jest.fn(async (analistaId: string) => catalogoPorAnalista[analistaId] ?? []),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
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
      listarSoftwareDisponibleUseCase: new ListarSoftwareDisponible(repository),
      compararPorCategoriaUseCase: new CompararPorCategoria(repository),
      compararPorCategoriasCruzadasUseCase: new CompararPorCategoriasCruzadas(repository)
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

// M-08 (retoma, RF-62/63/64/67): N categorías — no reemplaza a /acceso,
// /tipo, /software (verificados intactos arriba), es una ruta nueva.
describe('GET /comparacion/por-categoria — RF-62/63/64/67', () => {
  test('sin query params, agrupa por tipoAcceso (default) usando cvssScore (default)', async () => {
    const res = await conToken('analista-comparacion-A')(conHttps(request(app).get('/comparacion/por-categoria')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { categoria: 'Remoto', media: 10, desviacionEstandar: null, cantidad: 1 },
      { categoria: 'Local', media: 9.8, desviacionEstandar: null, cantidad: 1 }
    ]);
  });

  test('con variableAgrupacion="software" (variable ABIERTA), descubre las categorías reales del catálogo', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/por-categoria').query({ variableAgrupacion: 'software' }))
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { categoria: 'Apache Log4j', media: 10, desviacionEstandar: null, cantidad: 1 },
      { categoria: 'OpenSSL', media: 9.8, desviacionEstandar: null, cantidad: 1 }
    ]);
  });

  test('variableAgrupacion inválida responde 400', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/por-categoria').query({ variableAgrupacion: 'noExiste' }))
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('noExiste');
  });

  test('variableValor inválida responde 400', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/por-categoria').query({ variableValor: 'noExiste' }))
    );

    expect(res.status).toBe(400);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/comparacion/por-categoria'));
    expect(res.status).toBe(401);
  });
});

// RF-65: cross-tab — pieza completamente nueva, sin equivalente previo.
describe('GET /comparacion/cruzada — RF-65', () => {
  test('sin query params, cruza tipoAcceso (default A) x estadoRemediacion (default B), solo celdas observadas', async () => {
    const res = await conToken('analista-comparacion-A')(conHttps(request(app).get('/comparacion/cruzada')));

    expect(res.status).toBe(200);
    // Las 2 vulnerabilidades del fixture nunca configuran estadoRemediacion
    // -> ambas caen en 'Pendiente' (default de la entidad) — 2 celdas
    // observadas, no las 6 posibles de un cartesiano completo.
    expect(res.body).toEqual([
      { categoriaA: 'Local', categoriaB: 'Pendiente', media: 9.8, desviacionEstandar: null, cantidad: 1 },
      { categoriaA: 'Remoto', categoriaB: 'Pendiente', media: 10, desviacionEstandar: null, cantidad: 1 }
    ]);
  });

  test('cruzar una variable contra sí misma responde 400', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/cruzada').query({ variableAgrupacionA: 'tipoAcceso', variableAgrupacionB: 'tipoAcceso' }))
    );

    expect(res.status).toBe(400);
  });

  test('con variableAgrupacionA="software" (abierta) y variableAgrupacionB="tipoAcceso" (cerrada)', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(
        request(app)
          .get('/comparacion/cruzada')
          .query({ variableAgrupacionA: 'software', variableAgrupacionB: 'tipoAcceso' })
      )
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { categoriaA: 'Apache Log4j', categoriaB: 'Remoto', media: 10, desviacionEstandar: null, cantidad: 1 },
        { categoriaA: 'OpenSSL', categoriaB: 'Local', media: 9.8, desviacionEstandar: null, cantidad: 1 }
      ])
    );
    expect(res.body).toHaveLength(2);
  });

  test('con variableValor="diasParaParche" explícito', async () => {
    const res = await conToken('analista-comparacion-A')(
      conHttps(request(app).get('/comparacion/cruzada').query({ variableValor: 'diasParaParche' }))
    );

    expect(res.status).toBe(200);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/comparacion/cruzada'));
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
