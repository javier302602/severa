import { Pool } from 'pg';
import { PostgresRegistroDeAlertasEmitidas } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresRegistroDeAlertasEmitidas';
import { PostgresVulnerabilidadRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresVulnerabilidadRepository';
import { PostgresNotificacionRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresNotificacionRepository';
import { ConsolaServicioDeNotificaciones } from '../../src/infrastructure/adapters/out/notificaciones/ConsolaServicioDeNotificaciones';
import { EmisorDeAlertasDePlazo } from '../../src/application/usecases/module_notificaciones_alertas/EmisorDeAlertasDePlazo';
import { GenerarRankingUrgencia } from '../../src/application/usecases/module_priorizacion_clasificacion/GenerarRankingUrgencia';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/shared/value-objects/TipoAcceso';

// Test de integración REAL contra Postgres (migración 017). La memoria de
// alertas emitidas tiene que ser atómica y estar acotada por analista: eso
// solo se puede comprobar ejecutando el SQL de verdad.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-alertas-integration-a';
const ANALISTA_B = 'analista-alertas-integration-b';
const HACE_DECADAS = new Date('2000-01-01T00:00:00Z');

describe('PostgresRegistroDeAlertasEmitidas — integración real', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const registro = new PostgresRegistroDeAlertasEmitidas(pool);
  const vulnerabilidadRepository = new PostgresVulnerabilidadRepository(pool);
  const notificacionRepository = new PostgresNotificacionRepository(pool);

  async function limpiar(): Promise<void> {
    // En cascada: vulnerabilidades, alertas emitidas y notificaciones.
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
  }

  // Guarda `cantidad` vulnerabilidades críticas cargadas hace décadas (o sea,
  // vencidas) y las devuelve como quedaron en la base, con su id real.
  async function cargarVencidas(analistaId: string, cantidad: number, prefijo = 2021): Promise<Vulnerabilidad[]> {
    for (let i = 0; i < cantidad; i += 1) {
      await vulnerabilidadRepository.guardar(
        new Vulnerabilidad(
          'sin-id',
          new IdentificadorCVE(`CVE-${prefijo}-${10000 + i}`),
          new CvssScore(9.5),
          'Software de prueba',
          new TipoAccesoValue('Sí'),
          5
        ).asignarAnalista(analistaId)
      );
    }
    // guardar() no persiste la fecha de carga (la pone la base, con la fecha
    // de hoy): se la atrasa a mano para que el plazo ya esté vencido.
    await pool.query('UPDATE vulnerabilidades SET fecha_carga = $2 WHERE analista_id = $1', [analistaId, HACE_DECADAS]);
    return vulnerabilidadRepository.listar(analistaId);
  }

  beforeAll(async () => {
    await limpiar();
  });

  beforeEach(async () => {
    for (const id of [ANALISTA_A, ANALISTA_B]) {
      await pool.query(
        `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
         VALUES ($1, 'Analista Alertas Integration', $2, 'hash', 'analista')
         ON CONFLICT (id) DO NOTHING`,
        [id, `${id}@severa.local`]
      );
    }
  });

  afterEach(async () => {
    await limpiar();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('la primera vez devuelve todas como nuevas; la segunda, ninguna', async () => {
    const ids = (await cargarVencidas(ANALISTA_A, 3)).map((v) => v.id);

    const primera = await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids);
    const segunda = await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids);

    expect(primera.sort()).toEqual([...ids].sort());
    expect(segunda).toEqual([]);
  });

  test('solo devuelve las que faltaban cuando llegan mezcladas con las ya registradas', async () => {
    const ids = (await cargarVencidas(ANALISTA_A, 4)).map((v) => v.id);
    await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids.slice(0, 2));

    const nuevas = await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids);

    expect(nuevas.sort()).toEqual(ids.slice(2).sort());
  });

  test('cada tipo de alerta lleva su propia cuenta', async () => {
    const ids = (await cargarVencidas(ANALISTA_A, 2)).map((v) => v.id);
    await registro.registrarNuevas(ANALISTA_A, 'PlazoProximoAVencer', ids);

    expect((await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids)).sort()).toEqual([...ids].sort());
  });

  test('ignora ids que no son de una vulnerabilidad guardada del analista: inexistentes, de otro analista o que no son un número', async () => {
    const [propia] = await cargarVencidas(ANALISTA_A, 1);
    const [ajena] = await cargarVencidas(ANALISTA_B, 1, 2022);

    const nuevas = await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', [propia.id, ajena.id, '999999999', 'no-es-un-id', '-3', '']);

    expect(nuevas).toEqual([propia.id]);
    // La del otro analista sigue sin registrar para él.
    expect(await registro.registrarNuevas(ANALISTA_B, 'PlazoVencido', [ajena.id])).toEqual([ajena.id]);
  });

  test('dos evaluaciones simultáneas se reparten las alertas: ninguna vulnerabilidad sale dos veces', async () => {
    const ids = (await cargarVencidas(ANALISTA_A, 30)).map((v) => v.id);

    const resultados = await Promise.all(Array.from({ length: 6 }, () => registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids)));

    const todas = resultados.flat();
    expect(todas).toHaveLength(30);
    expect(new Set(todas).size).toBe(30);
  });

  test('olvidar permite que se vuelvan a registrar como nuevas', async () => {
    const ids = (await cargarVencidas(ANALISTA_A, 3)).map((v) => v.id);
    await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids);

    await registro.olvidar(ANALISTA_A, 'PlazoVencido', [ids[0]]);

    expect(await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids)).toEqual([ids[0]]);
  });

  test('si se restablece el dataset, las vulnerabilidades que se vuelvan a cargar tienen sus alertas de nuevo', async () => {
    const ids = (await cargarVencidas(ANALISTA_A, 2)).map((v) => v.id);
    await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', ids);

    await vulnerabilidadRepository.eliminarTodas(ANALISTA_A);
    const { rows } = await pool.query('SELECT count(*)::int AS total FROM alertas_emitidas WHERE analista_id = $1', [ANALISTA_A]);
    expect(rows[0].total).toBe(0);

    const recargadas = (await cargarVencidas(ANALISTA_A, 2)).map((v) => v.id);
    expect((await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', recargadas)).sort()).toEqual([...recargadas].sort());
  });

  test('una lista vacía no hace nada', async () => {
    expect(await registro.registrarNuevas(ANALISTA_A, 'PlazoVencido', [])).toEqual([]);
    await expect(registro.olvidar(ANALISTA_A, 'PlazoVencido', [])).resolves.toBeUndefined();
  });

  // El caso que originó el problema, de punta a punta con la base real:
  // visitar Priorización varias veces con muchas vulnerabilidades vencidas.
  describe('RF-76 de punta a punta: generar el ranking varias veces', () => {
    const emisor = new EmisorDeAlertasDePlazo(registro, new ConsolaServicioDeNotificaciones(notificacionRepository));
    const ranking = new GenerarRankingUrgencia(vulnerabilidadRepository, emisor);
    let consola: jest.SpyInstance;

    beforeEach(() => {
      consola = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consola.mockRestore();
    });

    test('40 vencidas y cinco visitas: queda UNA notificación, no 200', async () => {
      await cargarVencidas(ANALISTA_A, 40);

      for (let visita = 0; visita < 5; visita += 1) {
        expect(await ranking.ejecutar(ANALISTA_A)).toHaveLength(40);
      }

      const notificaciones = await notificacionRepository.listarPorAnalista(ANALISTA_A);
      expect(notificaciones).toHaveLength(1);
      expect(notificaciones[0].tipo).toBe('PlazoVencido');
      expect(notificaciones[0].mensaje).toMatch(/^Plazo de remediación excedido en 40 vulnerabilidades: /);
    });

    test('pocas vencidas: una notificación por cada una, una sola vez, y nada para el otro analista', async () => {
      await cargarVencidas(ANALISTA_A, 3);
      await cargarVencidas(ANALISTA_B, 1, 2022);

      await ranking.ejecutar(ANALISTA_A);
      await ranking.ejecutar(ANALISTA_A);

      expect(await notificacionRepository.contarPorAnalista(ANALISTA_A)).toEqual({ total: 3, noLeidas: 3 });
      expect(await notificacionRepository.contarPorAnalista(ANALISTA_B)).toEqual({ total: 0, noLeidas: 0 });
    });

    test('si el analista borra la notificación, no se vuelve a generar', async () => {
      await cargarVencidas(ANALISTA_A, 2);
      await ranking.ejecutar(ANALISTA_A);
      const ids = (await notificacionRepository.listarPorAnalista(ANALISTA_A)).map((n) => n.id);

      await notificacionRepository.eliminarVarias(ids, ANALISTA_A);
      await ranking.ejecutar(ANALISTA_A);

      expect(await notificacionRepository.contarPorAnalista(ANALISTA_A)).toEqual({ total: 0, noLeidas: 0 });
    });
  });
});
