import { Pool } from 'pg';
import { PostgresVulnerabilidadRepository } from '../../src/infrastructure/adapters/out/persistence/PostgresVulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

// Test de integración REAL: pega contra un Postgres de verdad (mismo
// DATABASE_URL que usa la app — requiere `docker compose up -d postgres` o
// el stack completo corriendo), no un mock de VulnerabilidadRepository.
// Deliberado: es el único tipo de test capaz de atrapar el bug de Sprint 16
// (guardar() insertaba 'N/A'/null hardcodeados para
// tipo_vulnerabilidad/dias_para_parche sin importar lo que trajera la
// entidad) — los 200+ tests con mock de la suite normal pasaban igual,
// porque el mock nunca llega a ejecutar este SQL. Corre aparte
// (`npm run test:integration`, ver jest.integration.config.js) para no
// obligar a "npm test" a depender de una base de datos real.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

// CVE de formato válido (IdentificadorCVE lo exige) pero de un año/número muy
// poco probable de colisionar con datos reales importados por un usuario.
const CVE_DE_PRUEBA = 'CVE-1999-9001';

describe('PostgresVulnerabilidadRepository — integración real (Sprint 16)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresVulnerabilidadRepository(pool);

  afterEach(async () => {
    await pool.query('DELETE FROM vulnerabilidades WHERE cve = $1', [CVE_DE_PRUEBA]);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('guardar() y buscarPorCve() conservan tipoVulnerabilidad y diasParaParche en el roundtrip completo', async () => {
    const original = new Vulnerabilidad(
      '999',
      new IdentificadorCVE(CVE_DE_PRUEBA),
      new CvssScore(7.5),
      'Software De Prueba',
      new TipoAccesoValue('Sí'),
      42, // diasParaParche
      'Software De Prueba',
      'Buffer Overflow' // tipoVulnerabilidad
    );

    await repository.guardar(original);
    const recuperada = await repository.buscarPorCve(CVE_DE_PRUEBA);

    expect(recuperada).not.toBeNull();
    expect(recuperada?.diasParaParche).toBe(42);
    expect(recuperada?.tipoVulnerabilidad).toBe('Buffer Overflow');
  });

  test('guardar() sobre un CVE existente (ON CONFLICT) actualiza ambos campos, no los descarta', async () => {
    const primeraVersion = new Vulnerabilidad(
      '999',
      new IdentificadorCVE(CVE_DE_PRUEBA),
      new CvssScore(5.0),
      'Software De Prueba',
      new TipoAccesoValue('No'),
      10,
      'Software De Prueba',
      'SQL Injection'
    );
    await repository.guardar(primeraVersion);

    const versionActualizada = new Vulnerabilidad(
      '999',
      new IdentificadorCVE(CVE_DE_PRUEBA),
      new CvssScore(5.0),
      'Software De Prueba',
      new TipoAccesoValue('No'),
      99,
      'Software De Prueba',
      'Cross-Site Scripting'
    );
    await repository.guardar(versionActualizada);

    const recuperada = await repository.buscarPorCve(CVE_DE_PRUEBA);
    expect(recuperada?.diasParaParche).toBe(99);
    expect(recuperada?.tipoVulnerabilidad).toBe('Cross-Site Scripting');
  });

  test('diasParaParche ausente en la entidad se guarda y se lee como null/undefined, no como 0', async () => {
    const sinDiasParaParche = new Vulnerabilidad(
      '999',
      new IdentificadorCVE(CVE_DE_PRUEBA),
      new CvssScore(3.0),
      'Software De Prueba',
      new TipoAccesoValue('No'),
      undefined,
      'Software De Prueba',
      'Info Disclosure'
    );

    await repository.guardar(sinDiasParaParche);
    const recuperada = await repository.buscarPorCve(CVE_DE_PRUEBA);

    expect(recuperada?.diasParaParche).toBeUndefined();
  });
});
