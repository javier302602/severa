import { Pool } from 'pg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LectorExcelDataset } from '../../src/infrastructure/adapters/out/dataset/parsers/LectorExcelDataset';
import { PostgresVulnerabilidadRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresVulnerabilidadRepository';
import { PostgresAnalistaRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresAnalistaRepository';
import { PostgresEscalaDeClasificacionRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresEscalaDeClasificacionRepository';
import { ImportarDataset } from '../../src/application/usecases/module_carga_gestion_datasets/ImportarDataset';
import { ImportarDatasetConAuditoria } from '../../src/application/usecases/module_seguridad_auditoria/decoradores/ImportarDatasetConAuditoria';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { AuditoriaRepository } from '../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { EscalaDeClasificacion } from '../../src/domain/shared/value-objects/EscalaDeClasificacion';

// Defecto del 8.95 (RF-28 / RF-69, tanda d), contra PostgreSQL real:
// cvss_score es NUMERIC(3,1) y la base redondea a un decimal. Antes, un 8.95
// del archivo se clasificaba como Alto mientras se importaba (sin alerta
// crítica, sin contarse en el resumen) y quedaba guardado como 9.0, Crítico.
// Ahora el lector redondea igual que la base: lo que clasifica el dominio al
// importar tiene que ser exactamente lo que queda guardado.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';
const ANALISTA = 'analista-redondeo-cvss-integration';

const FILAS: Array<[string, string]> = [
  ['CVE-1997-0395', '3.95'],
  ['CVE-1997-0695', '6.95'],
  ['CVE-1997-0895', '8.95'],
  ['CVE-1997-0894', '8.94'],
  ['CVE-1997-0900', '9.0']
];

function escribirCsv(): string {
  const ruta = path.join(os.tmpdir(), `redondeo-cvss-${Date.now()}.csv`);
  const lineas = ['CVE,CVSS Score,Software,Acceso Remoto', ...FILAS.map(([cve, cvss]) => `${cve},${cvss},Prueba,Sí`)];
  fs.writeFileSync(ruta, lineas.join('\n'));
  return ruta;
}

describe('Redondeo del CVSS al importar: lo que se clasifica es lo que se guarda (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const vulnerabilidades = new PostgresVulnerabilidadRepository(pool);
  const lector = new LectorExcelDataset();
  let rutaCsv: string;

  beforeAll(async () => {
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA]);
    await pool.query(`INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol) VALUES ($1, $1, $2, 'hash', 'analista')`, [
      ANALISTA,
      `${ANALISTA}@severa.local`
    ]);
    rutaCsv = escribirCsv();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM vulnerabilidades WHERE analista_id = $1', [ANALISTA]);
  });

  afterAll(async () => {
    fs.unlinkSync(rutaCsv);
    await pool.query('DELETE FROM registros_auditoria WHERE usuario = $1', [ANALISTA]);
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA]);
    await pool.end();
  });

  async function guardadoEnLaBase(cve: string): Promise<number> {
    const { rows } = await pool.query('SELECT cvss_score FROM vulnerabilidades WHERE cve = $1 AND analista_id = $2', [cve, ANALISTA]);
    return Number(rows[0].cvss_score);
  }

  test('lectura de archivo: el puntaje leído ya es el que guarda la base (3.95→4.0, 6.95→7.0, 8.95→9.0)', async () => {
    const { importables } = await lector.leerArchivo(rutaCsv);
    await vulnerabilidades.guardarLote(importables.map((fila) => fila.vulnerabilidad.asignarAnalista(ANALISTA)));

    const leidos = Object.fromEntries(importables.map((fila) => [fila.vulnerabilidad.cve.valor, fila.vulnerabilidad.cvssScore.valor]));
    expect(leidos).toEqual({ 'CVE-1997-0395': 4.0, 'CVE-1997-0695': 7.0, 'CVE-1997-0895': 9.0, 'CVE-1997-0894': 8.9, 'CVE-1997-0900': 9.0 });
    for (const [cve] of FILAS) {
      expect(await guardadoEnLaBase(cve)).toBe(leidos[cve]);
    }
  });

  test.each([
    ['CVSS', EscalaDeClasificacion.CVSS],
    ['personalizada', EscalaDeClasificacion.personalizada({ moderado: 3.9, alto: 6.9, critico: 8.9 })]
  ])('con la escala %s, el nivel al importar es el mismo que el del catálogo guardado', async (_nombre, escala) => {
    const { importables } = await lector.leerArchivo(rutaCsv);
    await vulnerabilidades.guardarLote(importables.map((fila) => fila.vulnerabilidad.asignarAnalista(ANALISTA)));

    for (const fila of importables) {
      const nivelAlImportar = escala.clasificar(fila.vulnerabilidad.cvssScore.valor);
      const nivelGuardado = escala.clasificar(await guardadoEnLaBase(fila.vulnerabilidad.cve.valor));
      expect(nivelAlImportar).toBe(nivelGuardado);
    }
    expect(escala.clasificar(importables.find((f) => f.vulnerabilidad.cve.valor === 'CVE-1997-0895')!.vulnerabilidad.cvssScore.valor)).toBe('Crítico');
  });

  test('lectura en streaming (importar desde link): mismo redondeo', async () => {
    const leidos: Record<string, number> = {};
    await lector.leerArchivoCsvEnStreaming(rutaCsv, undefined, async (fila) => {
      if (fila.tipo === 'importable') leidos[fila.dato.vulnerabilidad.cve.valor] = fila.dato.vulnerabilidad.cvssScore.valor;
    });

    expect(leidos['CVE-1997-0395']).toBe(4.0);
    expect(leidos['CVE-1997-0695']).toBe(7.0);
    expect(leidos['CVE-1997-0895']).toBe(9.0);
  });

  test('el resumen de la importación cuenta como críticas exactamente las que quedan Críticas en el catálogo', async () => {
    const notificaciones = { notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined) };
    const auditoria: AuditoriaRepository = { registrar: jest.fn().mockResolvedValue(undefined), listar: jest.fn() };
    const importar = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidades),
      auditoria,
      notificaciones as unknown as ServicioDeNotificaciones,
      new PostgresAnalistaRepository(pool),
      new PostgresEscalaDeClasificacionRepository(pool)
    );

    await importar.ejecutar(await lector.leerArchivo(rutaCsv), ANALISTA);

    const { rows } = await pool.query('SELECT count(*)::int AS criticas FROM vulnerabilidades WHERE analista_id = $1 AND cvss_score >= 9.0', [ANALISTA]);
    expect(rows[0].criticas).toBe(2);
    expect(notificaciones.notificarImportacionCompletada).toHaveBeenCalledWith(ANALISTA, expect.objectContaining({ criticas: 2 }));
  });
});
