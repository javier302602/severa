import { Pool } from 'pg';
import { PostgresAnalistaRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresAnalistaRepository';

// Test de integración REAL (mismo criterio que
// PostgresVulnerabilidadRepository.integration.test.ts): pega contra un
// Postgres de verdad, no un mock — es el único tipo de test que atrapa un
// desalineamiento real entre la migración 015 (columnas
// variable_umbral_critico/valor_umbral_critico) y el SQL de
// actualizarUmbralCritico/obtenerUmbralCritico/listarTodos. Corre aparte
// (`npm run test:integration`), no forma parte de "npm test".
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-umbral-critico-integration-a';
const ANALISTA_B = 'analista-umbral-critico-integration-b';

describe('PostgresAnalistaRepository — integración real (RF-99/RF-100, M-13 retoma)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresAnalistaRepository(pool);

  beforeEach(async () => {
    await pool.query(
      `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
       VALUES ($1, 'Analista Umbral A', 'umbral-critico-integration-a@severa.local', 'hash', 'analista'),
              ($2, 'Analista Umbral B', 'umbral-critico-integration-b@severa.local', 'hash', 'analista')
       ON CONFLICT (id) DO NOTHING`,
      [ANALISTA_A, ANALISTA_B]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.end();
  });

  test('obtenerUmbralCritico devuelve null cuando el analista nunca configuró nada (columnas NULL, sin backfill)', async () => {
    const umbral = await repository.obtenerUmbralCritico(ANALISTA_A);
    expect(umbral).toBeNull();
  });

  test('actualizarUmbralCritico y obtenerUmbralCritico hacen roundtrip correcto', async () => {
    await repository.actualizarUmbralCritico(ANALISTA_A, 'diasParaParche', 30);

    const umbral = await repository.obtenerUmbralCritico(ANALISTA_A);

    expect(umbral).toEqual({ variable: 'diasParaParche', valor: 30 });
  });

  test('actualizarUmbralCritico es un UPDATE acotado: no toca nombre/correo/rol del analista', async () => {
    await repository.actualizarUmbralCritico(ANALISTA_A, 'cvssScore', 7.5);

    const analista = await repository.buscarPorId(ANALISTA_A);

    expect(analista?.nombre).toBe('Analista Umbral A');
    expect(analista?.correo.valor).toBe('umbral-critico-integration-a@severa.local');
  });

  test('el umbral configurado para un analista no afecta al de otro', async () => {
    await repository.actualizarUmbralCritico(ANALISTA_A, 'cvssScore', 7.5);

    const umbralB = await repository.obtenerUmbralCritico(ANALISTA_B);

    expect(umbralB).toBeNull();
  });

  test('listarTodos incluye a todos los analistas, sin filtrar por bloqueado', async () => {
    const todos = await repository.listarTodos();
    const ids = todos.map((a) => a.id);

    expect(ids).toEqual(expect.arrayContaining([ANALISTA_A, ANALISTA_B]));
  });
});
