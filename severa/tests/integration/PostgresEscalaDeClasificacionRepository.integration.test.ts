import { Pool } from 'pg';
import { PostgresEscalaDeClasificacionRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresEscalaDeClasificacionRepository';
import { EscalaDeClasificacion } from '../../src/domain/shared/value-objects/EscalaDeClasificacion';

// RF-28 / RF-69 (Modo B), migración 019, contra PostgreSQL real: guardar,
// actualizar y borrar la escala de un analista sin tocar la de otro, que la
// base misma rechace cortes desordenados o fuera de rango, y que la cuenta se
// lleve su escala.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';
const ANALISTA_A = 'analista-escala-integration-a';
const ANALISTA_B = 'analista-escala-integration-b';

describe('PostgresEscalaDeClasificacionRepository — RF-28 / RF-69 (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresEscalaDeClasificacionRepository(pool);

  beforeEach(async () => {
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    for (const id of [ANALISTA_A, ANALISTA_B]) {
      await pool.query(`INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol) VALUES ($1, $1, $2, 'hash', 'analista')`, [
        id,
        `${id}@severa.local`
      ]);
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.end();
  });

  test('sin escala guardada devuelve null', async () => {
    expect(await repository.obtener(ANALISTA_A)).toBeNull();
  });

  test('guarda, actualiza y borra la escala de un analista sin tocar la de otro', async () => {
    await repository.guardar(ANALISTA_A, EscalaDeClasificacion.personalizada({ moderado: 3.5, alto: 6, critico: 8.5 }));
    await repository.guardar(ANALISTA_B, EscalaDeClasificacion.personalizada({ moderado: 2, alto: 5, critico: 9.5 }));

    expect((await repository.obtener(ANALISTA_A))!.cortes).toEqual({ moderado: 3.5, alto: 6, critico: 8.5 });

    await repository.guardar(ANALISTA_A, EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 }));
    expect((await repository.obtener(ANALISTA_A))!.cortes).toEqual({ moderado: 4, alto: 7, critico: 8.5 });

    await repository.eliminar(ANALISTA_A);
    expect(await repository.obtener(ANALISTA_A)).toBeNull();
    expect((await repository.obtener(ANALISTA_B))!.cortes).toEqual({ moderado: 2, alto: 5, critico: 9.5 });
  });

  test('la base misma rechaza cortes desordenados, repetidos o fuera de rango', async () => {
    const insertar = (m: number, a: number, c: number) =>
      pool.query('INSERT INTO escalas_clasificacion (analista_id, corte_moderado, corte_alto, corte_critico) VALUES ($1, $2, $3, $4)', [
        ANALISTA_A,
        m,
        a,
        c
      ]);

    await expect(insertar(7, 4, 9)).rejects.toThrow(/chk_escalas_clasificacion_cortes/);
    await expect(insertar(4, 4, 9)).rejects.toThrow(/chk_escalas_clasificacion_cortes/);
    await expect(insertar(0, 4, 9)).rejects.toThrow(/chk_escalas_clasificacion_cortes/);
    await expect(insertar(4, 7, 10.5)).rejects.toThrow(/numeric field overflow|chk_escalas_clasificacion_cortes/);
  });

  test('eliminar la cuenta se lleva su escala (ON DELETE CASCADE)', async () => {
    await repository.guardar(ANALISTA_A, EscalaDeClasificacion.personalizada({ moderado: 3.5, alto: 6, critico: 8.5 }));

    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA_A]);

    const { rowCount } = await pool.query('SELECT 1 FROM escalas_clasificacion WHERE analista_id = $1', [ANALISTA_A]);
    expect(rowCount).toBe(0);
  });
});
