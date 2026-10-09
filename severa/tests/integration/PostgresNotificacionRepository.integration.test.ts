import { Pool } from 'pg';
import { PostgresNotificacionRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresNotificacionRepository';
import { Notificacion } from '../../src/domain/entities/Notificacion';

// Test de integración REAL: pega contra un Postgres de verdad (requiere
// `docker compose up -d postgres`). "Eliminar seleccionadas"/"Marcar todas
// como leídas" son operaciones scopeadas por dueño (WHERE destinatario = $N)
// — el único test capaz de probar eso de verdad es uno que ejecute el SQL
// real contra dos analistas distintos, no un mock.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-notif-integration-a';
const ANALISTA_B = 'analista-notif-integration-b';

describe('PostgresNotificacionRepository — integración real', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresNotificacionRepository(pool);

  beforeAll(async () => {
    for (const id of [ANALISTA_A, ANALISTA_B]) {
      await pool.query(
        `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
         VALUES ($1, 'Analista Integration Test', $2, 'hash', 'analista')
         ON CONFLICT (id) DO NOTHING`,
        [id, `${id}@severa.local`]
      );
    }
  });

  afterEach(async () => {
    await pool.query('DELETE FROM notificaciones WHERE destinatario = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.end();
  });

  test('eliminarVarias borra solo las notificaciones del analista dueño, aunque se le pasen ids de otro', async () => {
    await repository.guardar(new Notificacion('notif-a1', 'InformeListo', ANALISTA_A, false, new Date(), 'de A'));
    await repository.guardar(new Notificacion('notif-a2', 'InformeListo', ANALISTA_A, false, new Date(), 'de A'));
    await repository.guardar(new Notificacion('notif-b1', 'InformeListo', ANALISTA_B, false, new Date(), 'de B'));

    const eliminadas = await repository.eliminarVarias(['notif-a1', 'notif-b1'], ANALISTA_A);

    expect(eliminadas).toBe(1); // solo notif-a1: notif-b1 es de otro analista, no se borra

    const restantesA = await repository.listarPorAnalista(ANALISTA_A);
    const restantesB = await repository.listarPorAnalista(ANALISTA_B);
    expect(restantesA.map((n) => n.id)).toEqual(['notif-a2']);
    expect(restantesB.map((n) => n.id)).toEqual(['notif-b1']); // intacta
  });

  test('marcarTodasComoLeidas solo afecta al analista dueño', async () => {
    await repository.guardar(new Notificacion('notif-a1', 'InformeListo', ANALISTA_A, false, new Date(), 'de A'));
    await repository.guardar(new Notificacion('notif-b1', 'InformeListo', ANALISTA_B, false, new Date(), 'de B'));

    const marcadas = await repository.marcarTodasComoLeidas(ANALISTA_A);

    expect(marcadas).toBe(1);
    const [notifA] = await repository.listarPorAnalista(ANALISTA_A);
    const [notifB] = await repository.listarPorAnalista(ANALISTA_B);
    expect(notifA.leida).toBe(true);
    expect(notifB.leida).toBe(false); // intacta
  });

  // RF-103: el centro de notificaciones se consulta de a páginas.
  describe('paginado y conteo', () => {
    async function guardarVarias(analistaId: string, cantidad: number, leidasHasta = 0): Promise<void> {
      for (let i = 0; i < cantidad; i += 1) {
        // i = 0 es la más antigua.
        await repository.guardar(
          new Notificacion(`notif-${analistaId}-${String(i).padStart(3, '0')}`, 'InformeListo', analistaId, i < leidasHasta, new Date(Date.UTC(2026, 0, 1, 0, i)), `n${i}`)
        );
      }
    }

    test('devuelve de la más reciente a la más antigua, en páginas que no se pisan ni saltean nada', async () => {
      await guardarVarias(ANALISTA_A, 7);

      const primera = await repository.listarPorAnalista(ANALISTA_A, { limite: 3, desplazamiento: 0 });
      const segunda = await repository.listarPorAnalista(ANALISTA_A, { limite: 3, desplazamiento: 3 });
      const tercera = await repository.listarPorAnalista(ANALISTA_A, { limite: 3, desplazamiento: 6 });
      const masAlla = await repository.listarPorAnalista(ANALISTA_A, { limite: 3, desplazamiento: 9 });

      expect(primera.map((n) => n.mensaje)).toEqual(['n6', 'n5', 'n4']);
      expect(segunda.map((n) => n.mensaje)).toEqual(['n3', 'n2', 'n1']);
      expect(tercera.map((n) => n.mensaje)).toEqual(['n0']);
      expect(masAlla).toEqual([]);
    });

    test('con varias notificaciones de la misma fecha el orden sigue siendo estable entre páginas', async () => {
      const mismaFecha = new Date('2026-02-01T10:00:00Z');
      for (const id of ['notif-x-c', 'notif-x-a', 'notif-x-d', 'notif-x-b']) {
        await repository.guardar(new Notificacion(id, 'InformeListo', ANALISTA_A, false, mismaFecha, id));
      }

      const paginas = [
        ...(await repository.listarPorAnalista(ANALISTA_A, { limite: 2, desplazamiento: 0 })),
        ...(await repository.listarPorAnalista(ANALISTA_A, { limite: 2, desplazamiento: 2 }))
      ];

      // Las cuatro, una vez cada una.
      expect(paginas.map((n) => n.id).sort()).toEqual(['notif-x-a', 'notif-x-b', 'notif-x-c', 'notif-x-d']);
    });

    test('la página es solo del analista dueño', async () => {
      await guardarVarias(ANALISTA_A, 2);
      await guardarVarias(ANALISTA_B, 5);

      const deA = await repository.listarPorAnalista(ANALISTA_A, { limite: 50, desplazamiento: 0 });

      expect(deA).toHaveLength(2);
      expect(deA.every((n) => n.destinatario === ANALISTA_A)).toBe(true);
    });

    test('cuenta el total y las no leídas de cada analista por separado', async () => {
      await guardarVarias(ANALISTA_A, 7, 3);
      await guardarVarias(ANALISTA_B, 2);

      expect(await repository.contarPorAnalista(ANALISTA_A)).toEqual({ total: 7, noLeidas: 4 });
      expect(await repository.contarPorAnalista(ANALISTA_B)).toEqual({ total: 2, noLeidas: 2 });
      expect(await repository.contarPorAnalista('analista-que-no-existe')).toEqual({ total: 0, noLeidas: 0 });
    });
  });

  // RF-104.
  describe('eliminarLeidas', () => {
    test('borra solo las leídas, y solo las del analista dueño', async () => {
      await repository.guardar(new Notificacion('notif-a1', 'InformeListo', ANALISTA_A, true, new Date(), 'leída de A'));
      await repository.guardar(new Notificacion('notif-a2', 'InformeListo', ANALISTA_A, false, new Date(), 'no leída de A'));
      await repository.guardar(new Notificacion('notif-b1', 'InformeListo', ANALISTA_B, true, new Date(), 'leída de B'));

      const eliminadas = await repository.eliminarLeidas(ANALISTA_A);

      expect(eliminadas).toBe(1);
      expect((await repository.listarPorAnalista(ANALISTA_A)).map((n) => n.id)).toEqual(['notif-a2']);
      expect((await repository.listarPorAnalista(ANALISTA_B)).map((n) => n.id)).toEqual(['notif-b1']);
    });

    test('sin notificaciones leídas no borra nada', async () => {
      await repository.guardar(new Notificacion('notif-a1', 'InformeListo', ANALISTA_A, false, new Date(), 'no leída'));

      expect(await repository.eliminarLeidas(ANALISTA_A)).toBe(0);
      expect(await repository.contarPorAnalista(ANALISTA_A)).toEqual({ total: 1, noLeidas: 1 });
    });
  });
});
