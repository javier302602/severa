import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';
import { cerrarConexiones } from '../../src/infrastructure/config/container';

// RF-12 (M-02) — aislamiento de punta a punta: HTTP real, casos de uso
// reales y PostgreSQL real (migración 018). Los tests unitarios ya prueban
// cada capa por separado; este prueba que juntas responden lo correcto: la
// plantilla de otro analista es 404 —no 403—, igual que una que no existe,
// para no confirmar que existe.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-plantillas-http-a';
const ANALISTA_B = 'analista-plantillas-http-b';

const CSV = [
  'edad,ciudad,aprobado',
  '20,Lima,si',
  '25,Lima,no',
  '30,Cusco,si',
  '35,Lima,si',
  '40,Arequipa,no',
  '22,Cusco,si',
  '38,Lima,no',
  '30,Cusco,si',
  '28,Lima,si',
  '33,Cusco,no'
].join('\n');

const app = createApp();

function token(analistaId: string): string {
  return jwt.sign({ sub: analistaId, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function como(analistaId: string, req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https').set('Authorization', `Bearer ${token(analistaId)}`);
}

async function subirDataset(analistaId: string): Promise<string> {
  const res = await como(analistaId, request(app).post('/analisis-datos/analizar')).attach('archivo', Buffer.from(CSV), 'encuesta.csv');
  expect(res.status).toBe(200);
  return res.body.sesionId as string;
}

describe('Plantillas de análisis — aislamiento entre analistas por HTTP (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let sesionA: string;
  let sesionB: string;
  let plantillaDeA: string;

  beforeAll(async () => {
    await pool.query('DELETE FROM registros_auditoria WHERE usuario = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    for (const id of [ANALISTA_A, ANALISTA_B]) {
      await pool.query(
        `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol) VALUES ($1, $2, $3, 'hash', 'analista')`,
        [id, `Analista ${id}`, `${id}@severa.local`]
      );
    }

    // A configura su dataset y guarda una plantilla; B carga el suyo.
    sesionA = await subirDataset(ANALISTA_A);
    const corregido = await como(ANALISTA_A, request(app).put(`/analisis-datos/${sesionA}/tipo-de-variable`)).send({
      columna: 'edad',
      tipo: 'numerica_continua'
    });
    expect(corregido.status).toBe(200);
    const guardada = await como(ANALISTA_A, request(app).post(`/analisis-datos/${sesionA}/plantillas`)).send({ nombre: 'De A' });
    expect(guardada.status).toBe(201);
    plantillaDeA = guardada.body.id;

    sesionB = await subirDataset(ANALISTA_B);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM registros_auditoria WHERE usuario = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.end();
    await cerrarConexiones();
  });

  test('B no ve la plantilla de A en su lista', async () => {
    const deB = await como(ANALISTA_B, request(app).get('/plantillas-analisis'));
    expect(deB.status).toBe(200);
    expect(deB.body).toEqual([]);

    const deA = await como(ANALISTA_A, request(app).get('/plantillas-analisis'));
    expect(deA.body.map((p: { id: string }) => p.id)).toEqual([plantillaDeA]);
  });

  test('B no puede previsualizar la plantilla de A sobre su propio dataset: 404, igual que una inexistente', async () => {
    const ajena = await como(ANALISTA_B, request(app).get(`/analisis-datos/${sesionB}/plantillas/${plantillaDeA}/vista-previa`));
    const inexistente = await como(ANALISTA_B, request(app).get(`/analisis-datos/${sesionB}/plantillas/no-existe/vista-previa`));

    expect(ajena.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(ajena.body).toEqual(inexistente.body);
  });

  test('B no puede aplicar la plantilla de A: 404, y el dataset de B no cambia', async () => {
    const res = await como(ANALISTA_B, request(app).post(`/analisis-datos/${sesionB}/plantillas/${plantillaDeA}/aplicar`)).send({
      huella: 'cualquiera',
      confirmado: true
    });

    expect(res.status).toBe(404);
    const { rows } = await pool.query("SELECT tipos_corregidos FROM datasets_genericos WHERE analista_id = $1", [ANALISTA_B]);
    expect(rows.map((fila) => fila.tipos_corregidos)).toEqual([{}]);
  });

  test('B no puede eliminar la plantilla de A: 404, y la plantilla sigue existiendo', async () => {
    const res = await como(ANALISTA_B, request(app).delete(`/plantillas-analisis/${plantillaDeA}`));

    expect(res.status).toBe(404);
    const { rowCount } = await pool.query('SELECT 1 FROM plantillas_analisis WHERE id = $1', [plantillaDeA]);
    expect(rowCount).toBe(1);
  });

  test('B no puede usar la sesión de A para guardar ni para previsualizar: 404', async () => {
    const guardar = await como(ANALISTA_B, request(app).post(`/analisis-datos/${sesionA}/plantillas`)).send({ nombre: 'Robada' });
    const previsualizar = await como(ANALISTA_B, request(app).get(`/analisis-datos/${sesionA}/plantillas/${plantillaDeA}/vista-previa`));

    expect(guardar.status).toBe(404);
    expect(previsualizar.status).toBe(404);
  });

  test('el analista sale del token: un analistaId en el body no cambia de quién es la plantilla', async () => {
    const res = await como(ANALISTA_A, request(app).post(`/analisis-datos/${sesionA}/plantillas`)).send({
      nombre: 'Con body tramposo',
      analistaId: ANALISTA_B
    });

    expect(res.status).toBe(201);
    const { rows } = await pool.query('SELECT analista_id FROM plantillas_analisis WHERE id = $1', [res.body.id]);
    expect(rows[0].analista_id).toBe(ANALISTA_A);
  });

  test('A sí puede previsualizar y eliminar la suya', async () => {
    const vista = await como(ANALISTA_A, request(app).get(`/analisis-datos/${sesionA}/plantillas/${plantillaDeA}/vista-previa`));
    expect(vista.status).toBe(200);

    const eliminada = await como(ANALISTA_A, request(app).delete(`/plantillas-analisis/${plantillaDeA}`));
    expect(eliminada.status).toBe(204);
  });
});
