import { Pool } from 'pg';
import { PostgresVulnerabilidadRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresVulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/shared/value-objects/CvssScore';
import { FiltroVulnerabilidad } from '../../src/domain/shared/value-objects/FiltroVulnerabilidad';
import { EscalaDeClasificacion, NIVELES_DE_RIESGO } from '../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { NivelDeRiesgo } from '../../src/domain/shared/value-objects/NivelDeRiesgo';

// RF-28 / RF-69 (Modo B), contra PostgreSQL real: el filtro por nivel en SQL
// (rango de cvss_score) y la función de dominio (EscalaDeClasificacion.clasificar)
// tienen que dar EXACTAMENTE la misma categoría, en cada corte y a una décima
// de cada corte, con la escala CVSS y con una personalizada. Si alguna vez
// divergen (un >= que pasa a >, un redondeo), una pantalla que filtra y otra
// que etiqueta dirían cosas distintas sobre la misma vulnerabilidad.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';
const ANALISTA = 'analista-bordes-escala-integration';

const ESCALAS: Array<[string, EscalaDeClasificacion]> = [
  ['CVSS', EscalaDeClasificacion.CVSS],
  ['personalizada (3.5 / 6.0 / 8.5)', EscalaDeClasificacion.personalizada({ moderado: 3.5, alto: 6.0, critico: 8.5 })],
  ['personalizada con Crítico desde 10.0', EscalaDeClasificacion.personalizada({ moderado: 0.1, alto: 5.0, critico: 10.0 })]
];

// Cada corte de cada escala, y una décima antes y después; más los extremos.
function puntosDeBorde(): number[] {
  const puntos = new Set<number>([0, 10]);
  for (const [, escala] of ESCALAS) {
    for (const corte of Object.values(escala.cortes)) {
      for (const delta of [-0.1, 0, 0.1]) {
        const valor = Math.round((corte + delta) * 10) / 10;
        if (valor >= 0 && valor <= 10) puntos.add(valor);
      }
    }
  }
  return [...puntos].sort((a, b) => a - b);
}

const PUNTOS = puntosDeBorde();
// Un CVE por punto: CVE-1998-0000 es 0.0, CVE-1998-0085 es 8.5, CVE-1998-0100 es 10.0.
const cveDe = (valor: number) => `CVE-1998-${String(Math.round(valor * 10)).padStart(4, '0')}`;

describe('Bordes de la escala de clasificación: SQL y dominio dicen lo mismo (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresVulnerabilidadRepository(pool);

  beforeAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA]);
    await pool.query(`INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol) VALUES ($1, $1, $2, 'hash', 'analista')`, [
      ANALISTA,
      `${ANALISTA}@severa.local`
    ]);
    for (const valor of PUNTOS) {
      await repository.guardar(new Vulnerabilidad(cveDe(valor), new IdentificadorCVE(cveDe(valor)), new CvssScore(valor), 'Borde').asignarAnalista(ANALISTA));
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA]);
    await pool.end();
  });

  test('se prueban los cortes y sus vecinos a una décima', () => {
    expect(PUNTOS).toEqual(expect.arrayContaining([3.9, 4.0, 4.1, 8.4, 8.5, 8.6, 9.9, 10.0, 0.0, 0.1, 0.2]));
  });

  describe.each(ESCALAS)('escala %s', (_nombre, escala) => {
    const esperadoPorNivel = (nivel: NivelDeRiesgo) =>
      PUNTOS.filter((valor) => escala.clasificar(valor) === nivel)
        .map(cveDe)
        .sort();

    test.each(NIVELES_DE_RIESGO.map((nivel) => [nivel]))('%s: buscarConFiltros (catálogo y búsqueda) trae exactamente lo que el dominio clasifica así', async (nivel) => {
      const resultado = await repository.buscarConFiltros(new FiltroVulnerabilidad({ severidad: nivel }), ANALISTA, escala);

      expect(resultado.map((v) => v.cve.valor).sort()).toEqual(esperadoPorNivel(nivel));
    });

    test.each(NIVELES_DE_RIESGO.map((nivel) => [nivel]))('%s: filtrarPorNivelDeRiesgo da lo mismo', async (nivel) => {
      const resultado = await repository.filtrarPorNivelDeRiesgo(escala.rango(nivel), ANALISTA);

      expect(resultado.map((v) => v.cve.valor).sort()).toEqual(esperadoPorNivel(nivel));
    });

    test('los cuatro niveles reparten todo el catálogo, sin huecos ni repetidos', async () => {
      const porNivel = await Promise.all(NIVELES_DE_RIESGO.map((nivel) => repository.filtrarPorNivelDeRiesgo(escala.rango(nivel), ANALISTA)));
      const todos = porNivel.flat().map((v) => v.cve.valor);

      expect(todos).toHaveLength(PUNTOS.length);
      expect(new Set(todos).size).toBe(PUNTOS.length);
    });

    test('paginar por un nivel recorre exactamente el mismo conjunto que pedirlo entero', async () => {
      const nivel: NivelDeRiesgo = 'Moderado';
      const filtro = new FiltroVulnerabilidad({ severidad: nivel });
      const entero = await repository.buscarConFiltros(filtro, ANALISTA, escala);

      const paginado: string[] = [];
      for (let offset = 0; ; offset += 2) {
        const pagina = await repository.buscarConFiltros(filtro, ANALISTA, escala, { limite: 2, offset });
        paginado.push(...pagina.map((v) => v.cve.valor));
        if (pagina.length < 2) break;
      }

      expect(paginado).toEqual(entero.map((v) => v.cve.valor));
    });
  });
});
