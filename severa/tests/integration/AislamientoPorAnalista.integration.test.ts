import { Pool } from 'pg';
import { PostgresVulnerabilidadRepository } from '../../src/infrastructure/adapters/out/persistence/PostgresVulnerabilidadRepository';
import { PostgresAuditoriaRepository } from '../../src/infrastructure/adapters/out/persistence/PostgresAuditoriaRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { FiltroVulnerabilidad } from '../../src/domain/value-objects/FiltroVulnerabilidad';
import { ConsultarVulnerabilidadPorCVE } from '../../src/application/usecases/ConsultarVulnerabilidadPorCVE';
import { FiltrarPorRangoCvss } from '../../src/application/usecases/FiltrarPorRangoCvss';
import { CalcularResumenEstadistico } from '../../src/application/usecases/CalcularResumenEstadistico';
import { GenerarGrafico } from '../../src/application/usecases/GenerarGrafico';
import { CompararPorTipoAcceso } from '../../src/application/usecases/CompararPorTipoAcceso';
import { GenerarRankingUrgencia } from '../../src/application/usecases/GenerarRankingUrgencia';
import { BuscarConFiltros } from '../../src/application/usecases/BuscarConFiltros';
import { recopilarDatosDeInforme } from '../../src/application/usecases/RecopilarDatosDeInforme';
import { GraficosOutputPort } from '../../src/application/ports/out/GraficosOutputPort';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';

// Test de integración REAL (Paso 5 — multi-tenancy): pega contra el mismo
// Postgres real que PostgresVulnerabilidadRepository.integration.test.ts
// (requiere el stack de docker compose corriendo). No alcanza con mocks acá:
// un mock de VulnerabilidadRepository jamás ejercita el WHERE analista_id =
// $N real ni la restricción UNIQUE (analista_id, cve) de la migración 006 —
// exactamente el tipo de bug (IDOR a nivel de dataset completo) que este
// bloque de trabajo pidió cubrir con pruebas reales, no de humo.
//
// Para CADA UNO de los 7 módulos (Catálogo, Estadísticas, Gráficos,
// Comparación, Priorización, Búsqueda, Informes): el Analista A importa
// datos, el Analista B NO los ve en ese endpoint, y el Analista A sí los ve.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-aislamiento-test-A';
const ANALISTA_B = 'analista-aislamiento-test-B';

// CVE compartido a propósito por ambos analistas, con datos DISTINTOS en
// cada catálogo — prueba directa de que la restricción UNIQUE (analista_id,
// cve) de la migración 006 permite esto sin que un guardar() pise al otro
// (antes de la migración, UNIQUE(cve) global hacía que el segundo guardar()
// sobreescribiera silenciosamente el registro del primer analista).
const CVE_COMPARTIDO = 'CVE-1999-9999';
const CVE_SOLO_A_1 = 'CVE-1999-1001';
const CVE_SOLO_A_2 = 'CVE-1999-1002';
const CVE_SOLO_A_3 = 'CVE-1999-1003';
const CVE_SOLO_B_1 = 'CVE-1999-2001';
const CVE_SOLO_B_2 = 'CVE-1999-2002';
const CVE_SOLO_B_3 = 'CVE-1999-2003';

function graficosOutputPortFalso(): GraficosOutputPort {
  // Fake deliberado: este test prueba aislamiento de DATOS (qué software/CVE
  // entra a cada gráfico), no la calidad del renderizado SVG — eso ya está
  // cubierto por SvgGraficosAdapter.test.ts. Devuelve los datos tal cual los
  // recibe para poder inspeccionarlos en la aserción.
  return {
    renderizarHistograma: async (datos) => datos,
    renderizarBarras: async (datos) => datos,
    renderizarPastel: async (datos) => datos,
    renderizarBoxplot: async (datos) => datos,
    renderizarDispersion: async (datos) => datos,
    renderizarBarrasHorizontales: async (datos) => datos
  };
}

function servicioDeNotificacionesFalso(): ServicioDeNotificaciones {
  return {
    notificarPlazoExcedido: async () => {},
    notificarVulnerabilidadCritica: async () => {},
    notificarInformeListo: async () => {},
    notificarActualizacionDisponible: async () => {},
    notificarImportacionCompletada: async () => {}
  };
}

describe('Multi-tenancy: aislamiento de datos por analista (Paso 5) — integración real', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const vulnerabilidadRepository = new PostgresVulnerabilidadRepository(pool);
  const auditoriaRepository = new PostgresAuditoriaRepository(pool);

  beforeAll(async () => {
    // Dos analistas reales (la FK vulnerabilidades.analista_id -> analistas.id
    // de la migración 006 lo exige) — se insertan directo por SQL, no vía
    // RegistrarAnalista, porque acá solo hace falta que la fila exista para
    // que el guardar() de más abajo no viole la FK.
    await pool.query(
      `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
       VALUES ($1, 'Analista Aislamiento A', 'aislamiento-a-test@severa.local', 'hash', 'analista'),
              ($2, 'Analista Aislamiento B', 'aislamiento-b-test@severa.local', 'hash', 'analista')
       ON CONFLICT (id) DO NOTHING`,
      [ANALISTA_A, ANALISTA_B]
    );

    // Analista A importa 4 vulnerabilidades (3 exclusivas + 1 CVE
    // compartido) — 2 remotas + 2 locales a propósito, para que
    // compararGrupos (varianza muestral) tenga los >=2 valores por grupo
    // que exige, tanto acá como dentro de recopilarDatosDeInforme.
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('a1', new IdentificadorCVE(CVE_SOLO_A_1), new CvssScore(9.5), 'A-Software-Log4j', new TipoAccesoValue('Sí'), 5, 'A-Software-Log4j', 'A-TipoX').asignarAnalista(ANALISTA_A)
    );
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('a2', new IdentificadorCVE(CVE_SOLO_A_2), new CvssScore(7.0), 'A-Software-Log4j', new TipoAccesoValue('Sí'), 6, 'A-Software-Log4j', 'A-TipoX').asignarAnalista(ANALISTA_A)
    );
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('a3', new IdentificadorCVE(CVE_SOLO_A_3), new CvssScore(4.0), 'A-Software-Log4j', new TipoAccesoValue('No'), 20, 'A-Software-Log4j', 'A-TipoX').asignarAnalista(ANALISTA_A)
    );
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('a4', new IdentificadorCVE(CVE_COMPARTIDO), new CvssScore(2.0), 'A-Compartido', new TipoAccesoValue('No'), 1, 'A-Compartido', 'A-TipoX').asignarAnalista(ANALISTA_A)
    );

    // Analista B importa 4 vulnerabilidades DISTINTAS (3 exclusivas + el
    // MISMO CVE compartido, pero con datos propios) — misma forma 2
    // remotas + 2 locales.
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('b1', new IdentificadorCVE(CVE_SOLO_B_1), new CvssScore(8.0), 'B-Software-OpenSSL', new TipoAccesoValue('Sí'), 8, 'B-Software-OpenSSL', 'B-TipoY').asignarAnalista(ANALISTA_B)
    );
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('b2', new IdentificadorCVE(CVE_SOLO_B_2), new CvssScore(6.5), 'B-Software-OpenSSL', new TipoAccesoValue('Sí'), 9, 'B-Software-OpenSSL', 'B-TipoY').asignarAnalista(ANALISTA_B)
    );
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('b3', new IdentificadorCVE(CVE_SOLO_B_3), new CvssScore(3.0), 'B-Software-OpenSSL', new TipoAccesoValue('No'), 30, 'B-Software-OpenSSL', 'B-TipoY').asignarAnalista(ANALISTA_B)
    );
    await vulnerabilidadRepository.guardar(
      new Vulnerabilidad('b4', new IdentificadorCVE(CVE_COMPARTIDO), new CvssScore(9.9), 'B-Compartido', new TipoAccesoValue('No'), 2, 'B-Compartido', 'B-TipoY').asignarAnalista(ANALISTA_B)
    );

    // Un evento de auditoría "ImportarDataset" por cada analista, para
    // probar (módulo Informes) que el informe de uno no muestra el último
    // import del otro, aunque registros_auditoria sea una tabla global.
    await auditoriaRepository.registrar({ usuario: ANALISTA_A, accion: 'ImportarDataset', detalle: 'AISLAMIENTO-TEST: 3 importados por A' });
    await auditoriaRepository.registrar({ usuario: ANALISTA_B, accion: 'ImportarDataset', detalle: 'AISLAMIENTO-TEST: 3 importados por B' });
  });

  afterAll(async () => {
    // ON DELETE CASCADE (migración 006) se encarga de borrar las
    // vulnerabilidades de ambos analistas al borrar la fila de `analistas`.
    // registros_auditoria NO tiene FK a analistas (RF-98, se conserva aunque
    // la cuenta se borre) — se limpia aparte por el detalle de esta prueba.
    await pool.query('DELETE FROM registros_auditoria WHERE detalle LIKE $1', ['AISLAMIENTO-TEST:%']);
    await pool.query('DELETE FROM analistas WHERE id IN ($1, $2)', [ANALISTA_A, ANALISTA_B]);
    await pool.end();
  });

  // ------------------------------------------------------------------
  // 1. Catálogo
  // ------------------------------------------------------------------
  describe('Catálogo (ConsultarVulnerabilidadPorCVE, FiltrarPorRangoCvss)', () => {
    test('B no puede consultar por CVE un registro exclusivo de A; A sí puede', async () => {
      const usecase = new ConsultarVulnerabilidadPorCVE(vulnerabilidadRepository);

      await expect(usecase.ejecutar(CVE_SOLO_A_1, ANALISTA_B)).resolves.toBeNull();
      const comoA = await usecase.ejecutar(CVE_SOLO_A_1, ANALISTA_A);
      expect(comoA?.cve.valor).toBe(CVE_SOLO_A_1);
    });

    test('el mismo CVE compartido devuelve datos DISTINTOS según quién pregunta (sin pisarse entre analistas)', async () => {
      const usecase = new ConsultarVulnerabilidadPorCVE(vulnerabilidadRepository);

      const comoA = await usecase.ejecutar(CVE_COMPARTIDO, ANALISTA_A);
      const comoB = await usecase.ejecutar(CVE_COMPARTIDO, ANALISTA_B);

      expect(comoA?.cvssScore.valor).toBe(2.0);
      expect(comoA?.software).toBe('A-Compartido');
      expect(comoB?.cvssScore.valor).toBe(9.9);
      expect(comoB?.software).toBe('B-Compartido');
    });

    test('filtrarPorRangoCvss de B nunca incluye CVEs exclusivos de A', async () => {
      const usecase = new FiltrarPorRangoCvss(vulnerabilidadRepository);

      const resultadosDeB = await usecase.ejecutar(0, 10, ANALISTA_B);
      const cvesDeB = resultadosDeB.map((item) => item.cve.valor);

      expect(cvesDeB).toEqual(expect.arrayContaining([CVE_SOLO_B_1, CVE_SOLO_B_2]));
      expect(cvesDeB).not.toContain(CVE_SOLO_A_1);
      expect(cvesDeB).not.toContain(CVE_SOLO_A_2);
    });
  });

  // ------------------------------------------------------------------
  // 2. Estadísticas
  // ------------------------------------------------------------------
  describe('Estadísticas (CalcularResumenEstadistico)', () => {
    test('la media de A se calcula solo con los CVSS de A, nunca mezclada con los de B', async () => {
      const usecase = new CalcularResumenEstadistico(vulnerabilidadRepository);

      const resumenA = await usecase.ejecutar(ANALISTA_A);
      const resumenB = await usecase.ejecutar(ANALISTA_B);

      // A: 9.5, 7.0, 4.0, 2.0 -> media 5.625. B: 8.0, 6.5, 3.0, 9.9 -> media 6.85.
      expect(resumenA.media).toBeCloseTo((9.5 + 7.0 + 4.0 + 2.0) / 4, 4);
      expect(resumenB.media).toBeCloseTo((8.0 + 6.5 + 3.0 + 9.9) / 4, 4);
      expect(resumenA.media).not.toBeCloseTo(resumenB.media, 1);
    });
  });

  // ------------------------------------------------------------------
  // 3. Gráficos
  // ------------------------------------------------------------------
  describe('Gráficos (GenerarGrafico — topSoftware)', () => {
    test('el top de software de B no incluye el software exclusivo de A', async () => {
      const usecase = new GenerarGrafico(vulnerabilidadRepository, graficosOutputPortFalso());

      // formato 'json' para que envolver() devuelva el array crudo en vez de
      // envolverlo en { svg, interpretacion } (comportamiento del formato
      // 'svg' por defecto, ver GenerarGrafico.ts).
      const resultado = (await usecase.ejecutar('topSoftware', ANALISTA_B, { formato: 'json' })) as Array<{ etiqueta: string }>;
      const etiquetas = resultado.map((item) => item.etiqueta);

      expect(etiquetas).toContain('B-Software-OpenSSL');
      expect(etiquetas).not.toContain('A-Software-Log4j');
    });
  });

  // ------------------------------------------------------------------
  // 4. Comparación
  // ------------------------------------------------------------------
  describe('Comparación (CompararPorTipoAcceso)', () => {
    test('la comparación remoto/local de A no se contamina con los registros de B', async () => {
      const usecase = new CompararPorTipoAcceso(vulnerabilidadRepository);

      // A: remoto=[9.5, 7.0] (a1, a2 son 'Sí'), local=[4.0, 2.0] (a3, a4 son 'No').
      const resultado = (await usecase.ejecutar(ANALISTA_A)) as { mediaA: number; mediaB: number };

      expect(resultado.mediaA).toBeCloseTo((9.5 + 7.0) / 2, 4);
      expect(resultado.mediaB).toBeCloseTo((4.0 + 2.0) / 2, 4);
    });
  });

  // ------------------------------------------------------------------
  // 5. Priorización
  // ------------------------------------------------------------------
  describe('Priorización (GenerarRankingUrgencia)', () => {
    test('el ranking de B nunca incluye CVEs exclusivos de A, y viceversa', async () => {
      const usecase = new GenerarRankingUrgencia(vulnerabilidadRepository, servicioDeNotificacionesFalso());

      const rankingA = await usecase.ejecutar(ANALISTA_A);
      const rankingB = await usecase.ejecutar(ANALISTA_B);

      const cvesA = rankingA.map((entrada) => entrada.vulnerabilidad.cve.valor);
      const cvesB = rankingB.map((entrada) => entrada.vulnerabilidad.cve.valor);

      expect(cvesA).toEqual(expect.arrayContaining([CVE_SOLO_A_1, CVE_SOLO_A_2]));
      expect(cvesA).not.toContain(CVE_SOLO_B_1);
      expect(cvesB).toEqual(expect.arrayContaining([CVE_SOLO_B_1, CVE_SOLO_B_2]));
      expect(cvesB).not.toContain(CVE_SOLO_A_1);
    });
  });

  // ------------------------------------------------------------------
  // 6. Búsqueda
  // ------------------------------------------------------------------
  describe('Búsqueda (BuscarConFiltros)', () => {
    test('un filtro amplio (cvssMin=0) de B nunca devuelve CVEs de A', async () => {
      const usecase = new BuscarConFiltros(vulnerabilidadRepository);
      const filtroAmplio = new FiltroVulnerabilidad({ cvssMin: 0 });

      const resultadosDeB = await usecase.ejecutar(filtroAmplio, ANALISTA_B);
      const cvesDeB = resultadosDeB.map((item) => item.cve.valor);

      expect(cvesDeB).toEqual(expect.arrayContaining([CVE_SOLO_B_1, CVE_SOLO_B_2]));
      expect(cvesDeB).not.toContain(CVE_SOLO_A_1);
      expect(cvesDeB).not.toContain(CVE_SOLO_A_2);
    });
  });

  // ------------------------------------------------------------------
  // 7. Informes
  // ------------------------------------------------------------------
  describe('Informes (recopilarDatosDeInforme)', () => {
    test('el informe de A cuenta solo sus propias vulnerabilidades y muestra su propio último import, no el de B', async () => {
      const datosA = await recopilarDatosDeInforme(vulnerabilidadRepository, auditoriaRepository, 'Analista A', ANALISTA_A);
      const datosB = await recopilarDatosDeInforme(vulnerabilidadRepository, auditoriaRepository, 'Analista B', ANALISTA_B);

      expect(datosA.totalVulnerabilidades).toBe(4);
      expect(datosB.totalVulnerabilidades).toBe(4);

      const cvesEnRankingA = datosA.rankingUrgencia.map((entrada) => entrada.vulnerabilidad.cve.valor);
      expect(cvesEnRankingA).not.toContain(CVE_SOLO_B_1);

      // El "último cambio registrado" es global en la tabla, pero el informe
      // debe filtrarlo por analistaId — sin ese filtro (bug real que este
      // caso cubre), el informe de A podría mostrar el import de B si el de
      // B fue el más reciente de TODA la tabla.
      expect(datosA.origenYCalidad.ultimoCambioRegistrado?.usuario).toBe(ANALISTA_A);
      expect(datosA.origenYCalidad.ultimoCambioRegistrado?.detalle).toContain('importados por A');
      expect(datosB.origenYCalidad.ultimoCambioRegistrado?.usuario).toBe(ANALISTA_B);
      expect(datosB.origenYCalidad.ultimoCambioRegistrado?.detalle).toContain('importados por B');
    });
  });
});
