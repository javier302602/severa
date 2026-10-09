import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { PostgresPlantillaDeAnalisisRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresPlantillaDeAnalisisRepository';
import { ConfiguracionDePlantilla, PlantillaDeAnalisis } from '../../src/domain/entities/PlantillaDeAnalisis';
import { NombreDePlantillaRepetidoError } from '../../src/domain/errors/PlantillaDeAnalisisErrors';

// Test de integración REAL contra Postgres (migración 018 aplicada). Lo que
// un doble en memoria no puede probar: que la base rechace el nombre repetido
// sin distinguir mayúsculas, que la restricción de nombre exista de verdad,
// que el SQL acote por analista y que la cuenta se lleve sus plantillas.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-plantillas-integration-a';
const ANALISTA_B = 'analista-plantillas-integration-b';

const CONFIGURACION: ConfiguracionDePlantilla = {
  tiposCorregidos: { edad: 'numerica_continua' },
  variableObjetivo: 'aprobado',
  clasificacion: {
    criterio: { nombreColumna: 'puntaje', tipo: 'numerica', umbrales: [{ minimo: 7, etiqueta: 'Alto' }, { minimo: 0, etiqueta: 'Bajo' }] },
    columnaClave: 'codigo'
  }
};

function plantilla(nombre: string, analistaId = ANALISTA_A, fecha = new Date('2026-10-01T12:00:00Z')): PlantillaDeAnalisis {
  return new PlantillaDeAnalisis(randomUUID(), analistaId, nombre, CONFIGURACION, fecha);
}

describe('PostgresPlantillaDeAnalisisRepository — RF-12 (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresPlantillaDeAnalisisRepository(pool);

  async function crearAnalistas(): Promise<void> {
    for (const id of [ANALISTA_A, ANALISTA_B]) {
      await pool.query(
        `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
         VALUES ($1, $2, $3, 'hash', 'analista')
         ON CONFLICT (id) DO NOTHING`,
        [id, `Analista ${id}`, `${id}@severa.local`]
      );
    }
  }

  beforeEach(async () => {
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await crearAnalistas();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.end();
  });

  test('guarda y recupera la plantilla con su configuración tal cual', async () => {
    const guardada = plantilla('Encuesta mensual');
    await repository.guardar(guardada);

    const leida = await repository.buscarPorId(guardada.id, ANALISTA_A);

    expect(leida).toEqual(guardada);
  });

  test('un nombre repetido sin distinguir mayúsculas se rechaza con NombreDePlantillaRepetidoError y no sobrescribe', async () => {
    const original = plantilla('Encuesta mensual');
    await repository.guardar(original);

    await expect(repository.guardar(plantilla('ENCUESTA MENSUAL'))).rejects.toThrow(NombreDePlantillaRepetidoError);
    await expect(repository.guardar(plantilla('encuesta mensual'))).rejects.toThrow(NombreDePlantillaRepetidoError);

    expect(await repository.listarPorAnalista(ANALISTA_A)).toEqual([original]);
  });

  test('otro analista puede tener una plantilla con el mismo nombre', async () => {
    await repository.guardar(plantilla('Encuesta mensual'));
    await expect(repository.guardar(plantilla('Encuesta mensual', ANALISTA_B))).resolves.toBeUndefined();
  });

  test('la base misma rechaza nombres con espacios al borde, vacíos o de más de 80 caracteres', async () => {
    const insertar = (nombre: string) =>
      pool.query(`INSERT INTO plantillas_analisis (id, analista_id, nombre, configuracion) VALUES ($1, $2, $3, '{}')`, [
        randomUUID(),
        ANALISTA_A,
        nombre
      ]);

    await expect(insertar(' Encuesta')).rejects.toThrow(/chk_plantillas_analisis_nombre/);
    await expect(insertar('')).rejects.toThrow(/chk_plantillas_analisis_nombre/);
    await expect(insertar('a'.repeat(81))).rejects.toThrow(/chk_plantillas_analisis_nombre/);
    await expect(insertar('a'.repeat(80))).resolves.toBeDefined();
    // 80 caracteres de 2 unidades UTF-16 cada uno: también entra.
    await expect(insertar('📊'.repeat(80))).resolves.toBeDefined();
  });

  test('todo acotado por analista: no se ve, no se busca ni se elimina la de otro', async () => {
    const deA = plantilla('De A');
    await repository.guardar(deA);

    expect(await repository.listarPorAnalista(ANALISTA_B)).toEqual([]);
    expect(await repository.buscarPorId(deA.id, ANALISTA_B)).toBeNull();
    expect(await repository.eliminar(deA.id, ANALISTA_B)).toBe(false);
    expect(await repository.buscarPorId(deA.id, ANALISTA_A)).not.toBeNull();

    expect(await repository.eliminar(deA.id, ANALISTA_A)).toBe(true);
    expect(await repository.buscarPorId(deA.id, ANALISTA_A)).toBeNull();
  });

  test('lista de la más nueva a la más vieja', async () => {
    const vieja = plantilla('Vieja', ANALISTA_A, new Date('2026-09-01T00:00:00Z'));
    const nueva = plantilla('Nueva', ANALISTA_A, new Date('2026-10-05T00:00:00Z'));
    await repository.guardar(vieja);
    await repository.guardar(nueva);

    expect((await repository.listarPorAnalista(ANALISTA_A)).map((p) => p.nombre)).toEqual(['Nueva', 'Vieja']);
  });

  test('eliminar la cuenta se lleva sus plantillas (ON DELETE CASCADE)', async () => {
    const deA = plantilla('De A');
    await repository.guardar(deA);

    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA_A]);

    const { rowCount } = await pool.query('SELECT 1 FROM plantillas_analisis WHERE id = $1', [deA.id]);
    expect(rowCount).toBe(0);
  });
});
