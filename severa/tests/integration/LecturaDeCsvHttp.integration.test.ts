import { createHash } from 'crypto';
import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';
import { cerrarConexiones } from '../../src/infrastructure/config/container';

// Lectura de CSV de punta a punta: HTTP real, lector real y PostgreSQL real.
// Un CSV como lo guarda Excel en español (UTF-8 sin BOM, punto y coma, coma
// decimal, tildes) tiene que llegar a las estadísticas con sus números y
// nombres intactos, la respuesta tiene que decir cómo se leyó, y el hash
// RF-135 sigue siendo el de los bytes tal como se subieron.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';
const ANALISTA = 'analista-lectura-csv-http';

const CSV_EXCEL_ES = Buffer.from(['Región;Temperatura;Código', 'Huánuco;25,5;1,234', 'Ñuñoa;31,2;5,678'].join('\r\n'), 'utf8');

const app = createApp();

function como(req: request.Test): request.Test {
  const token = jwt.sign({ sub: ANALISTA, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
  return req.set('x-forwarded-proto', 'https').set('Authorization', `Bearer ${token}`);
}

describe('Lectura de CSV por HTTP (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await pool.query('DELETE FROM registros_auditoria WHERE usuario = $1', [ANALISTA]);
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA]);
    await pool.query(`INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol) VALUES ($1, $1, $2, 'hash', 'analista')`, [
      ANALISTA,
      `${ANALISTA}@severa.local`
    ]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM registros_auditoria WHERE usuario = $1', [ANALISTA]);
    await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA]);
    await pool.end();
    await cerrarConexiones();
  });

  test('CSV de Excel en español: tildes, coma decimal (media 28,35), columna ambigua avisada y hash de los bytes', async () => {
    const res = await como(request(app).post('/analisis-datos/analizar')).attach('archivo', CSV_EXCEL_ES, 'clima.csv');
    expect(res.status).toBe(200);

    expect(res.body.lectura).toEqual({
      codificacion: 'UTF-8',
      separador: 'punto y coma',
      convencionDecimal: 'coma decimal',
      descripcion: 'UTF-8, separado por punto y coma, con coma decimal',
      avisos: [expect.stringMatching(/^La columna "Código" quedó como texto: .*"1,234"/)]
    });

    const perfil = res.body.perfilVariables as Array<{ nombre: string; media?: number; tipo?: string }>;
    expect(perfil.map((p) => p.nombre)).toEqual(['Región', 'Temperatura', 'Código']);
    expect(perfil.find((p) => p.nombre === 'Temperatura')?.media).toBeCloseTo(28.35, 10);
    expect(perfil.find((p) => p.nombre === 'Código')?.media).toBeUndefined();

    const { rows } = await pool.query('SELECT columnas, hash_original_sha256 FROM datasets_genericos WHERE id = $1 AND analista_id = $2', [
      res.body.datasetId,
      ANALISTA
    ]);
    expect(rows[0].hash_original_sha256).toBe(createHash('sha256').update(CSV_EXCEL_ES).digest('hex'));
    expect(rows[0].columnas).toEqual(['Región', 'Temperatura', 'Código']);

    const { rows: registros } = await pool.query(
      'SELECT valores FROM registros_datasets_genericos WHERE dataset_id = $1 ORDER BY posicion',
      [res.body.datasetId]
    );
    expect(registros.map((r) => r.valores)).toEqual([
      { 'Región': 'Huánuco', Temperatura: 25.5, 'Código': '1,234' },
      { 'Región': 'Ñuñoa', Temperatura: 31.2, 'Código': '5,678' }
    ]);
  });

  test('el nombre del archivo con tildes se guarda como se subió (el navegador lo manda en UTF-8)', async () => {
    const res = await como(request(app).post('/analisis-datos/analizar')).attach('archivo', CSV_EXCEL_ES, 'Población Huánuco.csv');
    expect(res.status).toBe(200);

    const { rows } = await pool.query('SELECT nombre_archivo FROM datasets_genericos WHERE id = $1', [res.body.datasetId]);
    expect(rows[0].nombre_archivo).toBe('Población Huánuco.csv');
  });

  test('un .xlsx no trae información de lectura de texto (null)', async () => {
    const XLSX = await import('xlsx');
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Región', 'Temperatura'], ['Huánuco', 25.5], ['Ñuñoa', 31.2]]), 'Hoja1');
    const bytes = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = await como(request(app).post('/analisis-datos/analizar')).attach('archivo', bytes, 'clima.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.lectura).toBeNull();
  });
});
