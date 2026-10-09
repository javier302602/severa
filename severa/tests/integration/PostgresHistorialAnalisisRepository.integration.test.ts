import { Pool } from 'pg';
import { PostgresHistorialAnalisisRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresHistorialAnalisisRepository';
import { PostgresDatasetGenericoRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresDatasetGenericoRepository';
import { SesionAnalisisStoreEnMemoria } from '../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { RegistrarEnHistorialDeAnalisis } from '../../src/application/usecases/module_perfil_analista/RegistrarEnHistorialDeAnalisis';
import { ObtenerHistorialAnalisis } from '../../src/application/usecases/module_perfil_analista/ObtenerHistorialAnalisis';
import { AnalisisRealizado } from '../../src/domain/entities/AnalisisRealizado';
import { DatasetGenerico } from '../../src/domain/entities/DatasetGenerico';

// Test de integración REAL contra Postgres. Lo que solo se puede comprobar
// con el SQL de verdad: que un id repetido no se guarda dos veces (ni
// siquiera con pedidos simultáneos), el orden estable del listado y que todo
// queda acotado por analista.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-historial-integration-a';
const ANALISTA_B = 'analista-historial-integration-b';

describe('PostgresHistorialAnalisisRepository — integración real', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repositorio = new PostgresHistorialAnalisisRepository(pool);

  async function limpiar(): Promise<void> {
    // En cascada: historial y datasets.
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
  }

  beforeEach(async () => {
    await limpiar();
    for (const id of [ANALISTA_A, ANALISTA_B]) {
      await pool.query(
        `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol) VALUES ($1, $2, $3, 'hash', 'analista')`,
        [id, id, `${id}@example.com`]
      );
    }
  });

  afterAll(async () => {
    await limpiar();
    await pool.end();
  });

  test('registrarSiEsNuevo guarda la primera vez y no hace nada con un id repetido', async () => {
    const primero = new AnalisisRealizado('historial-int-1', ANALISTA_A, 'Graficos', { dataset: 'Catálogo de vulnerabilidades' }, new Date('2026-10-01T10:00:00Z'));
    const repetido = new AnalisisRealizado('historial-int-1', ANALISTA_A, 'Graficos', { dataset: 'otro' }, new Date('2026-10-02T10:00:00Z'));

    expect(await repositorio.registrarSiEsNuevo(primero)).toBe(true);
    expect(await repositorio.registrarSiEsNuevo(repetido)).toBe(false);

    const guardados = await repositorio.listarPorAnalista(ANALISTA_A);
    expect(guardados).toHaveLength(1);
    // Queda el primero, sin pisarlo.
    expect(guardados[0].payload).toEqual({ dataset: 'Catálogo de vulnerabilidades' });
    expect(guardados[0].fechaHora).toEqual(new Date('2026-10-01T10:00:00Z'));
  });

  test('veinte intentos simultáneos con el mismo id dejan una sola fila y ninguno falla', async () => {
    const intentos = Array.from({ length: 20 }, () =>
      repositorio.registrarSiEsNuevo(new AnalisisRealizado('historial-int-concurrente', ANALISTA_A, 'ValoresAtipicos', {}, new Date()))
    );

    const resultados = await Promise.all(intentos);

    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(await repositorio.contarPorAnalista(ANALISTA_A)).toBe(1);
  });

  test('lista del más reciente al más antiguo, pagina sin repetir ni saltear y cuenta el total', async () => {
    // Diez eventos con la MISMA fecha: sin un desempate estable, dos páginas
    // consecutivas podrían repetir o saltear filas.
    const misma = new Date('2026-10-05T10:00:00Z');
    for (let i = 0; i < 10; i += 1) {
      await repositorio.registrar(new AnalisisRealizado(`historial-int-p-${i}`, ANALISTA_A, 'Graficos', { n: i }, misma));
    }
    await repositorio.registrar(new AnalisisRealizado('historial-int-nuevo', ANALISTA_A, 'Graficos', {}, new Date('2026-10-06T10:00:00Z')));
    await repositorio.registrar(new AnalisisRealizado('historial-int-viejo', ANALISTA_A, 'Graficos', {}, new Date('2026-10-04T10:00:00Z')));

    const paginas = [
      await repositorio.listarPorAnalista(ANALISTA_A, { limite: 5, offset: 0 }),
      await repositorio.listarPorAnalista(ANALISTA_A, { limite: 5, offset: 5 }),
      await repositorio.listarPorAnalista(ANALISTA_A, { limite: 5, offset: 10 })
    ];
    const ids = paginas.flat().map((evento) => evento.id);

    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(ids[0]).toBe('historial-int-nuevo');
    expect(ids[11]).toBe('historial-int-viejo');
    expect(await repositorio.contarPorAnalista(ANALISTA_A)).toBe(12);
  });

  test('cada analista ve y cuenta solo lo suyo', async () => {
    await repositorio.registrar(new AnalisisRealizado('historial-int-a', ANALISTA_A, 'Graficos', {}, new Date()));
    await repositorio.registrar(new AnalisisRealizado('historial-int-b1', ANALISTA_B, 'Graficos', {}, new Date()));
    await repositorio.registrar(new AnalisisRealizado('historial-int-b2', ANALISTA_B, 'Graficos', {}, new Date()));

    expect((await repositorio.listarPorAnalista(ANALISTA_A)).map((evento) => evento.id)).toEqual(['historial-int-a']);
    expect(await repositorio.contarPorAnalista(ANALISTA_A)).toBe(1);
    expect(await repositorio.contarPorAnalista(ANALISTA_B)).toBe(2);
  });

  test('de punta a punta: un análisis de sesión queda una sola vez, con el dataset guardado de verdad', async () => {
    const datasets = new PostgresDatasetGenericoRepository(pool);
    const store = new SesionAnalisisStoreEnMemoria();
    const dataset = new DatasetGenerico('dataset-historial-int', ANALISTA_A, 'encuesta.csv', ['edad'], 'archivo', null, 0);
    await datasets.guardar(dataset);
    const sesionId = store.crear(ANALISTA_A, { columnas: ['edad'], filas: [{ edad: 30 }], datasetId: dataset.id });

    // Dos instancias (como dos réplicas del servidor, o un reinicio): ninguna
    // recuerda lo que anotó la otra, pero la base sí.
    const registrarUno = new RegistrarEnHistorialDeAnalisis(repositorio, store, datasets);
    const registrarDos = new RegistrarEnHistorialDeAnalisis(repositorio, store, datasets);
    await Promise.all([
      registrarUno.deSesion(ANALISTA_A, sesionId, 'EstadisticasDescriptivas'),
      registrarDos.deSesion(ANALISTA_A, sesionId, 'EstadisticasDescriptivas'),
      registrarUno.deSesion(ANALISTA_A, sesionId, 'EstadisticasDescriptivas')
    ]);

    const pagina = await new ObtenerHistorialAnalisis(repositorio).ejecutar(ANALISTA_A);
    expect(pagina.total).toBe(1);
    expect(pagina.eventos[0]).toMatchObject({
      tipoDeAnalisis: 'Estadísticas descriptivas',
      dataset: 'encuesta.csv',
      datasetId: 'dataset-historial-int',
      version: 0,
      origen: 'dataset'
    });
  });

  test('al eliminar la cuenta, su historial se va con ella', async () => {
    await repositorio.registrar(new AnalisisRealizado('historial-int-cuenta', ANALISTA_A, 'Graficos', {}, new Date()));

    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA_A]);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM analisis_realizados WHERE analista_id = $1', [ANALISTA_A]);
    expect(rows[0].total).toBe(0);
  });
});
