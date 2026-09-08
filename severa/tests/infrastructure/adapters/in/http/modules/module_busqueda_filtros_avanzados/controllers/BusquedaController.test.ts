import request from 'supertest';
import jwt from 'jsonwebtoken';

// Mismo criterio que ComparacionController.test.ts/AnalisisDatasetController.test.ts:
// casos de uso REALES (no mocks del caso de uso) contra repositorios falsos
// en memoria — así se prueba la cadena completa HTTP -> controller ->
// FiltroVulnerabilidad -> caso de uso -> repositorio, incluida la
// combinación real de filtros de RF-88 (se captura el objeto exacto que
// arma el controller, no un mock genérico).
jest.mock('../../../../../../../../src/infrastructure/config/container', () => {
  const { BuscarConFiltros } = require('../../../../../../../../src/application/usecases/module_busqueda_filtros_avanzados/BuscarConFiltros');
  const { ExportarBusquedaFiltrada } = require('../../../../../../../../src/application/usecases/module_busqueda_filtros_avanzados/ExportarBusquedaFiltrada');
  const { GuardarFiltroFavorito } = require('../../../../../../../../src/application/usecases/module_busqueda_filtros_avanzados/GuardarFiltroFavorito');
  const { ListarFiltrosFavoritos } = require('../../../../../../../../src/application/usecases/module_busqueda_filtros_avanzados/ListarFiltrosFavoritos');
  const { EliminarFiltroFavorito } = require('../../../../../../../../src/application/usecases/module_busqueda_filtros_avanzados/EliminarFiltroFavorito');
  const { Vulnerabilidad } = require('../../../../../../../../src/domain/entities/Vulnerabilidad');
  const { IdentificadorCVE } = require('../../../../../../../../src/domain/shared/value-objects/IdentificadorCVE');
  const { CvssScore } = require('../../../../../../../../src/domain/shared/value-objects/CvssScore');
  const { TipoAccesoValue } = require('../../../../../../../../src/domain/shared/value-objects/TipoAcceso');
  const { FiltroFavorito } = require('../../../../../../../../src/domain/entities/FiltroFavorito');

  // Catálogos separados por analista, para los tests de scoping/IDOR.
  const catalogoPorAnalista: Record<string, InstanceType<typeof Vulnerabilidad>[]> = {
    'analista-busqueda-A': [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'))
    ],
    'analista-busqueda-B': [
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'))
    ]
  };

  const vulnerabilidadRepository = {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn(),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    listarPorSoftware: jest.fn(),
    actualizarEstado: jest.fn(),
    // RF-88: el fake devuelve el catálogo del analista que llama, tal cual
    // haría el WHERE analista_id = $1 real — permite probar scoping sin DB.
    // No filtra de verdad por los demás criterios (eso es responsabilidad de
    // PostgresVulnerabilidadRepository, ya cubierto aparte) — lo que este
    // archivo prueba es que el controller ARMA el filtro combinado
    // correctamente, capturando el argumento real recibido.
    buscarConFiltros: jest.fn(async (_filtro: unknown, analistaId: string) => catalogoPorAnalista[analistaId] ?? []),
    eliminarTodas: jest.fn()
  };

  // Favoritos en memoria, scopeados por analistaId — mismo criterio IDOR que
  // el repositorio real (WHERE analista_id = $1 / AND analista_id = $2).
  let favoritos: InstanceType<typeof FiltroFavorito>[] = [
    new FiltroFavorito('fav-de-A', 'analista-busqueda-A', 'Críticos', { severidad: 'Crítica' })
  ];
  const filtroFavoritoRepository = {
    guardar: jest.fn(async (favorito: InstanceType<typeof FiltroFavorito>) => {
      favoritos.push(favorito);
    }),
    listarPorAnalista: jest.fn(async (analistaId: string) => favoritos.filter((f) => f.analistaId === analistaId)),
    eliminar: jest.fn(async (id: string, analistaId: string) => {
      const indice = favoritos.findIndex((f) => f.id === id && f.analistaId === analistaId);
      if (indice === -1) return false;
      favoritos.splice(indice, 1);
      return true;
    })
  };

  return {
    container: {
      buscarConFiltrosUseCase: new BuscarConFiltros(vulnerabilidadRepository),
      exportarBusquedaFiltradaUseCase: new ExportarBusquedaFiltrada(vulnerabilidadRepository),
      guardarFiltroFavoritoUseCase: new GuardarFiltroFavorito(filtroFavoritoRepository),
      listarFiltrosFavoritosUseCase: new ListarFiltrosFavoritos(filtroFavoritoRepository),
      eliminarFiltroFavoritoUseCase: new EliminarFiltroFavorito(filtroFavoritoRepository),
      // Expuestos para que los tests puedan inspeccionar las llamadas reales.
      __vulnerabilidadRepository: vulnerabilidadRepository,
      __filtroFavoritoRepository: filtroFavoritoRepository
    }
  };
});

import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { container } from '../../../../../../../../src/infrastructure/config/container';

const repo = (container as any).__vulnerabilidadRepository;
const repoFavoritos = (container as any).__filtroFavoritoRepository;

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

describe('GET /vulnerabilidades/buscar — RF-84 a RF-88', () => {
  test('camino feliz con un solo filtro', async () => {
    const res = await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica' })));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ cve: 'CVE-2021-44228', cvssScore: 10, estadoRemediacion: 'Pendiente' })
    ]);
  });

  test('RF-88: combina 6 filtros a la vez en un solo FiltroVulnerabilidad, sin que se pisen entre sí', async () => {
    repo.buscarConFiltros.mockClear();

    await conToken('analista-busqueda-A')(
      conHttps(
        request(app).get('/vulnerabilidades/buscar').query({
          cvssMin: 7,
          cvssMax: 10,
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-06-01',
          componente: 'Apache Log4j',
          estadoRemediacion: 'Pendiente'
        })
      )
    );

    expect(repo.buscarConFiltros).toHaveBeenCalledTimes(1);
    const filtroRecibido = repo.buscarConFiltros.mock.calls[0][0];
    expect(filtroRecibido.cvssMin).toBe(7);
    expect(filtroRecibido.cvssMax).toBe(10);
    expect(filtroRecibido.fechaDesde).toEqual(new Date('2026-01-01'));
    expect(filtroRecibido.fechaHasta).toEqual(new Date('2026-06-01'));
    expect(filtroRecibido.componente).toBe('Apache Log4j');
    expect(filtroRecibido.estadoRemediacion).toBe('Pendiente');
    expect(filtroRecibido.cve).toBeUndefined();
    expect(filtroRecibido.severidad).toBeUndefined();
  });

  test('paginación: sin query params usa el default (200, offset 0)', async () => {
    repo.buscarConFiltros.mockClear();

    await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica' })));

    expect(repo.buscarConFiltros.mock.calls[0][2]).toEqual({ limite: 200, offset: 0 });
  });

  test('paginación: pagina y limite explícitos calculan el offset correcto', async () => {
    repo.buscarConFiltros.mockClear();

    await conToken('analista-busqueda-A')(
      conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica', pagina: 3, limite: 50 }))
    );

    expect(repo.buscarConFiltros.mock.calls[0][2]).toEqual({ limite: 50, offset: 100 });
  });

  test('paginación: un límite por encima del tope se acota a 500', async () => {
    repo.buscarConFiltros.mockClear();

    await conToken('analista-busqueda-A')(
      conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica', limite: 9999 }))
    );

    expect(repo.buscarConFiltros.mock.calls[0][2].limite).toBe(500);
  });

  test('sin ningún criterio real responde 400 (FiltroVacioError)', async () => {
    const res = await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar')));
    expect(res.status).toBe(400);
  });

  test('cvssMin fuera de rango responde 400 (CvssFueraDeRangoError)', async () => {
    const res = await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar').query({ cvssMin: 15 })));
    expect(res.status).toBe(400);
  });

  test('un cve con formato inválido responde 400', async () => {
    const res = await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar').query({ cve: 'no-es-un-cve' })));
    expect(res.status).toBe(400);
  });

  test('IDOR/scoping: cada analista ve solo su propio catálogo con el mismo filtro', async () => {
    const resA = await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica' })));
    const resB = await conToken('analista-busqueda-B')(conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica' })));

    expect(resA.body.map((v: { cve: string }) => v.cve)).toEqual(['CVE-2021-44228']);
    expect(resB.body.map((v: { cve: string }) => v.cve)).toEqual(['CVE-2021-20021']);
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).get('/vulnerabilidades/buscar').query({ severidad: 'Crítica' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /vulnerabilidades/buscar/exportar — RF-90', () => {
  test('camino feliz: responde 200 con un .xlsx', async () => {
    const res = await conToken('analista-busqueda-A')(
      conHttps(request(app).get('/vulnerabilidades/buscar/exportar').query({ severidad: 'Crítica' }))
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  test('filtro vacío responde 400', async () => {
    const res = await conToken('analista-busqueda-A')(conHttps(request(app).get('/vulnerabilidades/buscar/exportar')));
    expect(res.status).toBe(400);
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).get('/vulnerabilidades/buscar/exportar').query({ severidad: 'Crítica' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /filtros-favoritos — RF-89', () => {
  test('camino feliz: guarda con el analistaId del token, responde 201', async () => {
    const res = await conToken('analista-busqueda-A')(
      conHttps(request(app).post('/filtros-favoritos').send({ nombre: 'Mi filtro', criterios: { severidad: 'Alta' } }))
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ analistaId: 'analista-busqueda-A', nombre: 'Mi filtro', criterios: { severidad: 'Alta' } });
  });

  test('criterios vacíos responde 400 antes de persistir', async () => {
    repoFavoritos.guardar.mockClear();

    const res = await conToken('analista-busqueda-A')(
      conHttps(request(app).post('/filtros-favoritos').send({ nombre: 'Vacío', criterios: {} }))
    );

    expect(res.status).toBe(400);
    expect(repoFavoritos.guardar).not.toHaveBeenCalled();
  });

  test('IDOR: un analistaId falso en el body se ignora, se guarda con el id real del token', async () => {
    const res = await conToken('analista-busqueda-B')(
      conHttps(
        request(app)
          .post('/filtros-favoritos')
          .send({ analistaId: 'analista-busqueda-A', nombre: 'Intento de suplantación', criterios: { severidad: 'Baja' } })
      )
    );

    expect(res.status).toBe(201);
    expect(res.body.analistaId).toBe('analista-busqueda-B');
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).post('/filtros-favoritos').send({ nombre: 'X', criterios: { severidad: 'Alta' } }));
    expect(res.status).toBe(401);
  });
});

describe('GET /filtros-favoritos — RF-89', () => {
  test('IDOR/scoping: cada analista ve solo sus propios favoritos', async () => {
    const resA = await conToken('analista-busqueda-A')(conHttps(request(app).get('/filtros-favoritos')));
    const resB = await conToken('analista-busqueda-B')(conHttps(request(app).get('/filtros-favoritos')));

    expect(resA.body.some((f: { nombre: string }) => f.nombre === 'Críticos')).toBe(true);
    expect(resB.body.some((f: { nombre: string }) => f.nombre === 'Críticos')).toBe(false);
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).get('/filtros-favoritos'));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /filtros-favoritos/:id — RF-89', () => {
  test('camino feliz: borra el propio favorito, responde 204', async () => {
    const creado = await conToken('analista-busqueda-A')(
      conHttps(request(app).post('/filtros-favoritos').send({ nombre: 'Para borrar', criterios: { severidad: 'Media' } }))
    );

    const res = await conToken('analista-busqueda-A')(conHttps(request(app).delete(`/filtros-favoritos/${creado.body.id}`)));

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  test('id inexistente responde 404', async () => {
    const res = await conToken('analista-busqueda-A')(conHttps(request(app).delete('/filtros-favoritos/no-existe')));
    expect(res.status).toBe(404);
  });

  test('IDOR: un analista no puede borrar el favorito de otro (404, no 403)', async () => {
    const creado = await conToken('analista-busqueda-A')(
      conHttps(request(app).post('/filtros-favoritos').send({ nombre: 'De A', criterios: { severidad: 'Alta' } }))
    );

    const res = await conToken('analista-busqueda-B')(conHttps(request(app).delete(`/filtros-favoritos/${creado.body.id}`)));
    expect(res.status).toBe(404);

    // Confirma que de verdad no se borró (no solo que respondió 404).
    const listado = await conToken('analista-busqueda-A')(conHttps(request(app).get('/filtros-favoritos')));
    expect(listado.body.some((f: { id: string }) => f.id === creado.body.id)).toBe(true);
  });

  test('sin autenticar responde 401', async () => {
    const res = await conHttps(request(app).delete('/filtros-favoritos/cualquier-id'));
    expect(res.status).toBe(401);
  });
});
