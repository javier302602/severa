import { Pool } from 'pg';
import { PostgresNotificacionRepository } from '../../src/infrastructure/adapters/out/persistence/PostgresNotificacionRepository';
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
});
