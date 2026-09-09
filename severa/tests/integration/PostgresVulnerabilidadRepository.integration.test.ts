import { Pool } from 'pg';
import { PostgresVulnerabilidadRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresVulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/shared/value-objects/TipoAcceso';
import { FiltroVulnerabilidad } from '../../src/domain/shared/value-objects/FiltroVulnerabilidad';

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

// Migración 006 (multi-tenancy): vulnerabilidades.analista_id es NOT NULL con
// FK a analistas(id) — hace falta una fila real de analista para que
// guardar() no viole la restricción.
const ANALISTA_DE_PRUEBA = 'analista-repo-integration-test';

describe('PostgresVulnerabilidadRepository — integración real (Sprint 16 + migración 006)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresVulnerabilidadRepository(pool);

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
       VALUES ($1, 'Analista Integration Test', 'repo-integration-test@severa.local', 'hash', 'analista')
       ON CONFLICT (id) DO NOTHING`,
      [ANALISTA_DE_PRUEBA]
    );
  });

  afterEach(async () => {
    await pool.query('DELETE FROM vulnerabilidades WHERE cve = $1 OR cve LIKE $2', [CVE_DE_PRUEBA, 'CVE-1999-92%']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA_DE_PRUEBA]);
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

    await repository.guardar(original.asignarAnalista(ANALISTA_DE_PRUEBA));
    const recuperada = await repository.buscarPorCve(CVE_DE_PRUEBA, ANALISTA_DE_PRUEBA);

    expect(recuperada).not.toBeNull();
    expect(recuperada?.diasParaParche).toBe(42);
    expect(recuperada?.tipoVulnerabilidad).toBe('Buffer Overflow');
  });

  test('guardar() sobre un CVE existente del MISMO analista (ON CONFLICT) actualiza ambos campos, no los descarta', async () => {
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
    await repository.guardar(primeraVersion.asignarAnalista(ANALISTA_DE_PRUEBA));

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
    await repository.guardar(versionActualizada.asignarAnalista(ANALISTA_DE_PRUEBA));

    const recuperada = await repository.buscarPorCve(CVE_DE_PRUEBA, ANALISTA_DE_PRUEBA);
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

    await repository.guardar(sinDiasParaParche.asignarAnalista(ANALISTA_DE_PRUEBA));
    const recuperada = await repository.buscarPorCve(CVE_DE_PRUEBA, ANALISTA_DE_PRUEBA);

    expect(recuperada?.diasParaParche).toBeUndefined();
  });

  // guardarLote (2026-07-17, importación de datasets grandes en streaming):
  // el único test capaz de ejercitar el INSERT multi-VALUES real contra
  // Postgres — todos los tests con mock de la suite normal mockean
  // guardarLote entero, nunca ejecutan este SQL de verdad.
  describe('guardarLote', () => {
    const CVES_DE_LOTE = ['CVE-1999-9101', 'CVE-1999-9102', 'CVE-1999-9103'];

    afterEach(async () => {
      await pool.query('DELETE FROM vulnerabilidades WHERE cve = ANY($1)', [CVES_DE_LOTE]);
    });

    test('inserta varias filas nuevas en un solo lote', async () => {
      const lote = CVES_DE_LOTE.map(
        (cve, i) =>
          new Vulnerabilidad(
            String(900 + i),
            new IdentificadorCVE(cve),
            new CvssScore(5.0 + i),
            'Software De Lote',
            new TipoAccesoValue('Sí'),
            undefined,
            'Software De Lote',
            'SQL Injection'
          ).asignarAnalista(ANALISTA_DE_PRUEBA)
      );

      await repository.guardarLote(lote);

      for (const [i, cve] of CVES_DE_LOTE.entries()) {
        const recuperada = await repository.buscarPorCve(cve, ANALISTA_DE_PRUEBA);
        expect(recuperada?.cvssScore.valor).toBe(5.0 + i);
      }
    });

    test('un lote con el mismo CVE repetido más de una vez no rompe (ON CONFLICT no puede afectar la misma fila dos veces en un statement) — se queda con la última aparición', async () => {
      const cve = CVES_DE_LOTE[0];
      const primeraVersion = new Vulnerabilidad(
        '900',
        new IdentificadorCVE(cve),
        new CvssScore(3.0),
        'Version Vieja',
        new TipoAccesoValue('No'),
        undefined,
        'Version Vieja',
        'XSS'
      ).asignarAnalista(ANALISTA_DE_PRUEBA);
      const versionRepetidaEnElMismoLote = new Vulnerabilidad(
        '900',
        new IdentificadorCVE(cve),
        new CvssScore(9.0),
        'Version Nueva',
        new TipoAccesoValue('Sí'),
        undefined,
        'Version Nueva',
        'RCE'
      ).asignarAnalista(ANALISTA_DE_PRUEBA);

      await repository.guardarLote([primeraVersion, versionRepetidaEnElMismoLote]);

      const recuperada = await repository.buscarPorCve(cve, ANALISTA_DE_PRUEBA);
      expect(recuperada?.cvssScore.valor).toBe(9.0);
      expect(recuperada?.software).toBe('Version Nueva');
    });

    test('re-guardar un lote con un CVE ya existente (ON CONFLICT entre lotes distintos) actualiza en vez de duplicar', async () => {
      const cve = CVES_DE_LOTE[1];
      await repository.guardarLote([
        new Vulnerabilidad(
          '901',
          new IdentificadorCVE(cve),
          new CvssScore(4.0),
          'Original',
          new TipoAccesoValue('No'),
          undefined,
          'Original',
          'SQL Injection'
        ).asignarAnalista(ANALISTA_DE_PRUEBA)
      ]);
      await repository.guardarLote([
        new Vulnerabilidad(
          '901',
          new IdentificadorCVE(cve),
          new CvssScore(8.0),
          'Actualizada',
          new TipoAccesoValue('Sí'),
          undefined,
          'Actualizada',
          'RCE'
        ).asignarAnalista(ANALISTA_DE_PRUEBA)
      ]);

      const contarFilas = await pool.query('SELECT COUNT(*)::int AS total FROM vulnerabilidades WHERE cve = $1', [cve]);
      expect(contarFilas.rows[0].total).toBe(1);

      const recuperada = await repository.buscarPorCve(cve, ANALISTA_DE_PRUEBA);
      expect(recuperada?.cvssScore.valor).toBe(8.0);
    });

    test('un lote vacío no hace ninguna consulta ni rompe', async () => {
      await expect(repository.guardarLote([])).resolves.toBeUndefined();
    });
  });

  // Paginación (2026-07-19): BusquedaController pasa LIMIT/OFFSET reales para
  // no traer/renderizar decenas de miles de filas de una sola vez. Este es el
  // único test que ejercita el SQL real (LIMIT/OFFSET, ORDER BY cvss_score
  // DESC) — la suite con mock (BuscarConFiltros.test.ts) solo prueba que el
  // usecase reenvía el parámetro, no que Postgres lo aplique bien.
  describe('buscarConFiltros — paginación', () => {
    const CVES_DE_PAGINACION = ['CVE-1999-9201', 'CVE-1999-9202', 'CVE-1999-9203', 'CVE-1999-9204', 'CVE-1999-9205'];

    beforeEach(async () => {
      // CVSS descendente 9.5..9.1 para que el ORDER BY cvss_score DESC dé un
      // orden predecible y así poder pedir páginas de tamaño 2 sin ambigüedad.
      for (const [i, cve] of CVES_DE_PAGINACION.entries()) {
        await repository.guardar(
          new Vulnerabilidad(cve, new IdentificadorCVE(cve), new CvssScore(9.5 - i * 0.1), 'Paginacion De Prueba', new TipoAccesoValue('Sí')).asignarAnalista(
            ANALISTA_DE_PRUEBA
          )
        );
      }
    });

    test('sin paginación, devuelve las 5 filas (comportamiento previo, usado por ExportarBusquedaFiltrada)', async () => {
      const filtro = new FiltroVulnerabilidad({ componente: 'Paginacion De Prueba' });
      const resultado = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA);
      expect(resultado).toHaveLength(5);
    });

    test('con limite=2, offset=0 y offset=2 devuelve páginas consecutivas sin solapar ni saltear filas', async () => {
      const filtro = new FiltroVulnerabilidad({ componente: 'Paginacion De Prueba' });

      const pagina1 = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA, { limite: 2, offset: 0 });
      const pagina2 = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA, { limite: 2, offset: 2 });
      const pagina3 = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA, { limite: 2, offset: 4 });

      expect(pagina1.map((v) => v.cve.valor)).toEqual(['CVE-1999-9201', 'CVE-1999-9202']);
      expect(pagina2.map((v) => v.cve.valor)).toEqual(['CVE-1999-9203', 'CVE-1999-9204']);
      expect(pagina3.map((v) => v.cve.valor)).toEqual(['CVE-1999-9205']);
    });

    // Bug real encontrado en verificación en vivo (2026-07-19, dataset NVD de
    // 15.816 filas reales: 4154 empatadas en cvss_score=7.5 dentro de una
    // sola severidad): "ORDER BY cvss_score DESC" a secas no es determinista
    // entre ejecuciones cuando hay empates — dos llamadas paginadas
    // consecutivas devolvían filas repetidas y otras nunca aparecían. Estas 5
    // filas comparten el MISMO cvss_score a propósito, para reproducir
    // exactamente ese escenario contra Postgres real.
    test('con CVSS empatado entre todas las filas, la paginación sigue sin solapar ni saltear (desempate por cve)', async () => {
      for (const cve of CVES_DE_PAGINACION) {
        await repository.guardar(
          new Vulnerabilidad(cve, new IdentificadorCVE(cve), new CvssScore(7.5), 'Paginacion Empate', new TipoAccesoValue('Sí')).asignarAnalista(
            ANALISTA_DE_PRUEBA
          )
        );
      }
      const filtro = new FiltroVulnerabilidad({ componente: 'Paginacion Empate' });

      const pagina1 = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA, { limite: 2, offset: 0 });
      const pagina2 = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA, { limite: 2, offset: 2 });
      const pagina3 = await repository.buscarConFiltros(filtro, ANALISTA_DE_PRUEBA, { limite: 2, offset: 4 });

      const todasLasFilas = [...pagina1, ...pagina2, ...pagina3].map((v) => v.cve.valor);
      expect(todasLasFilas).toEqual([...new Set(todasLasFilas)]); // sin duplicados
      expect(todasLasFilas.sort()).toEqual([...CVES_DE_PAGINACION].sort()); // sin filas salteadas
    });
  });

  // Bug real reportado: comparar "Apache Log4j" vs "log4j" (nombre parcial)
  // no encontraba nada porque listarPorSoftware hacía ILIKE exacto (sin
  // comodines) — confirmado contra Postgres real, no solo contra un mock.
  describe('listarPorSoftware — coincidencia parcial', () => {
    const CVE_LOG4J = 'CVE-1999-9301';

    afterEach(async () => {
      await pool.query('DELETE FROM vulnerabilidades WHERE cve = $1', [CVE_LOG4J]);
    });

    test('"log4j" (parcial, minúsculas) encuentra una fila guardada como "Apache Log4j"', async () => {
      await repository.guardar(
        new Vulnerabilidad(CVE_LOG4J, new IdentificadorCVE(CVE_LOG4J), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')).asignarAnalista(
          ANALISTA_DE_PRUEBA
        )
      );

      const resultado = await repository.listarPorSoftware('log4j', ANALISTA_DE_PRUEBA);

      expect(resultado.map((v) => v.cve.valor)).toEqual([CVE_LOG4J]);
    });
  });

  // Dropdown de "Comparación por software" (2026-07-20): valores reales del
  // catálogo, sin duplicados, y sin filtrar por otro analista.
  describe('listarSoftwareDisponible', () => {
    const CVES = ['CVE-1999-9401', 'CVE-1999-9402', 'CVE-1999-9403'];

    afterEach(async () => {
      await pool.query('DELETE FROM vulnerabilidades WHERE cve = ANY($1)', [CVES]);
    });

    test('devuelve software distinto, sin duplicados, ordenado', async () => {
      await repository.guardar(new Vulnerabilidad(CVES[0], new IdentificadorCVE(CVES[0]), new CvssScore(9.0), 'Nginx', new TipoAccesoValue('Sí')).asignarAnalista(ANALISTA_DE_PRUEBA));
      await repository.guardar(new Vulnerabilidad(CVES[1], new IdentificadorCVE(CVES[1]), new CvssScore(8.0), 'Apache Log4j', new TipoAccesoValue('Sí')).asignarAnalista(ANALISTA_DE_PRUEBA));
      // Mismo software que la primera fila — no debe duplicarse en el resultado.
      await repository.guardar(new Vulnerabilidad(CVES[2], new IdentificadorCVE(CVES[2]), new CvssScore(7.0), 'Nginx', new TipoAccesoValue('No')).asignarAnalista(ANALISTA_DE_PRUEBA));

      const resultado = await repository.listarSoftwareDisponible(ANALISTA_DE_PRUEBA);

      expect(resultado).toEqual(['Apache Log4j', 'Nginx']);
    });
  });

  // M-04 (retoma, RF-27/RF-28): filtrarPorRango/filtrarPorCategoria son los
  // únicos métodos nuevos de esta ronda — el mapeo columna-SQL
  // (COLUMNA_SQL_NUMERICA/COLUMNA_SQL_CATEGORICA) y, sobre todo, el
  // comportamiento real de Postgres con NULLs en dias_para_parche (columna
  // nullable) solo se prueban de verdad acá, contra la base real — un mock
  // de VulnerabilidadRepository nunca ejecuta este SQL (mismo motivo que el
  // resto de este archivo).
  describe('filtrarPorRango — RF-27 generalizado', () => {
    const CVES_RANGO = ['CVE-1999-9501', 'CVE-1999-9502', 'CVE-1999-9503'];

    afterEach(async () => {
      await pool.query('DELETE FROM vulnerabilidades WHERE cve = ANY($1)', [CVES_RANGO]);
    });

    test('variable="cvssScore" (default) filtra por cvss_score, igual que antes de esta ronda', async () => {
      await repository.guardar(
        new Vulnerabilidad(CVES_RANGO[0], new IdentificadorCVE(CVES_RANGO[0]), new CvssScore(3.0), 'Rango CVSS').asignarAnalista(ANALISTA_DE_PRUEBA)
      );
      await repository.guardar(
        new Vulnerabilidad(CVES_RANGO[1], new IdentificadorCVE(CVES_RANGO[1]), new CvssScore(8.0), 'Rango CVSS').asignarAnalista(ANALISTA_DE_PRUEBA)
      );

      const resultado = await repository.filtrarPorRango('cvssScore', 7.0, 10.0, ANALISTA_DE_PRUEBA);

      expect(resultado.map((v) => v.cve.valor)).toEqual([CVES_RANGO[1]]);
    });

    // El caso pedido explícitamente: dias_para_parche es NULLABLE (migración
    // 002, sin NOT NULL) — una fila sin diasParaParche debe quedar EXCLUIDA
    // de cualquier rango (el comportamiento nativo de "NULL BETWEEN x AND y"
    // en SQL, nunca verdadero), y una fila CON diasParaParche dentro del
    // rango debe quedar INCLUIDA. No es un comportamiento que el código de
    // la app implemente a mano — es Postgres mismo — pero es exactamente lo
    // que un mock no puede demostrar, y es el motivo por el que esta prueba
    // vive acá y no en el conjunto de tests con mock.
    test('variable="diasParaParche": excluye filas con diasParaParche NULL e incluye las que caen en el rango', async () => {
      const conDiasEnRango = new Vulnerabilidad(
        CVES_RANGO[0], new IdentificadorCVE(CVES_RANGO[0]), new CvssScore(5.0), 'Con dias en rango',
        new TipoAccesoValue('Sí'), 15
      ).asignarAnalista(ANALISTA_DE_PRUEBA);
      const conDiasFueraDeRango = new Vulnerabilidad(
        CVES_RANGO[1], new IdentificadorCVE(CVES_RANGO[1]), new CvssScore(5.0), 'Con dias fuera de rango',
        new TipoAccesoValue('Sí'), 90
      ).asignarAnalista(ANALISTA_DE_PRUEBA);
      const sinDias = new Vulnerabilidad(
        CVES_RANGO[2], new IdentificadorCVE(CVES_RANGO[2]), new CvssScore(5.0), 'Sin dias para parche',
        new TipoAccesoValue('Sí'), undefined
      ).asignarAnalista(ANALISTA_DE_PRUEBA);

      await repository.guardar(conDiasEnRango);
      await repository.guardar(conDiasFueraDeRango);
      await repository.guardar(sinDias);

      const resultado = await repository.filtrarPorRango('diasParaParche', 0, 30, ANALISTA_DE_PRUEBA);

      expect(resultado.map((v) => v.cve.valor)).toEqual([CVES_RANGO[0]]);
      expect(resultado.map((v) => v.cve.valor)).not.toContain(CVES_RANGO[2]); // NULL excluido
      expect(resultado.map((v) => v.cve.valor)).not.toContain(CVES_RANGO[1]); // fuera de rango
    });
  });

  describe('filtrarPorCategoria — RF-28 generalizado', () => {
    const CVES_CATEGORIA = ['CVE-1999-9601', 'CVE-1999-9602', 'CVE-1999-9603'];

    afterEach(async () => {
      await pool.query('DELETE FROM vulnerabilidades WHERE cve = ANY($1)', [CVES_CATEGORIA]);
    });

    test('variable="severidad" (default) filtra por la columna severidad, igual que antes de esta ronda', async () => {
      await repository.guardar(
        new Vulnerabilidad(CVES_CATEGORIA[0], new IdentificadorCVE(CVES_CATEGORIA[0]), new CvssScore(9.5), 'Categoria Severidad').asignarAnalista(ANALISTA_DE_PRUEBA)
      );

      const resultado = await repository.filtrarPorCategoria('severidad', 'Crítica', ANALISTA_DE_PRUEBA);

      expect(resultado.map((v) => v.cve.valor)).toEqual([CVES_CATEGORIA[0]]);
    });

    // tipoAcceso es la única variable categórica cuya columna SQL es BOOLEAN
    // (acceso_remoto) en vez de texto — la traducción 'Remoto'/'Local' -> true/false
    // solo se demuestra contra Postgres real (un mock no valida el tipo de columna).
    test('variable="tipoAcceso" traduce "Remoto"/"Local" a la columna booleana acceso_remoto', async () => {
      await repository.guardar(
        new Vulnerabilidad(CVES_CATEGORIA[0], new IdentificadorCVE(CVES_CATEGORIA[0]), new CvssScore(5.0), 'Acceso Remoto', new TipoAccesoValue('Sí')).asignarAnalista(ANALISTA_DE_PRUEBA)
      );
      await repository.guardar(
        new Vulnerabilidad(CVES_CATEGORIA[1], new IdentificadorCVE(CVES_CATEGORIA[1]), new CvssScore(5.0), 'Acceso Local', new TipoAccesoValue('No')).asignarAnalista(ANALISTA_DE_PRUEBA)
      );

      const resultado = await repository.filtrarPorCategoria('tipoAcceso', 'Remoto', ANALISTA_DE_PRUEBA);

      expect(resultado.map((v) => v.cve.valor)).toEqual([CVES_CATEGORIA[0]]);
    });

    test('variable="estadoRemediacion" filtra por la columna estado_remediacion', async () => {
      await repository.guardar(
        new Vulnerabilidad(CVES_CATEGORIA[0], new IdentificadorCVE(CVES_CATEGORIA[0]), new CvssScore(5.0), 'Estado Pendiente').asignarAnalista(ANALISTA_DE_PRUEBA)
      );

      const resultado = await repository.filtrarPorCategoria('estadoRemediacion', 'Pendiente', ANALISTA_DE_PRUEBA);

      expect(resultado.map((v) => v.cve.valor)).toEqual([CVES_CATEGORIA[0]]);
    });
  });
});
