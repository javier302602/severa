import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';

// RF-58 (M-07) — mismo criterio que AnalisisDatasetFase3.test.ts: flujo real,
// sin mockear el container, para probar el mismo sesionAnalisisStore/IDOR de
// punta a punta. Generalización de M-03: AnalizarDatasetGenerico también
// persiste en datasets_genericos/registros_datasets_genericos y audita —
// ambas cosas requerirían una base de datos real, así que se reemplazan por
// fakes en memoria (lección de la regresión encontrada en esa misma ronda).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(container.analizarDatasetGenericoUseCase as any).usecase.datasetGenericoRepository = {
  guardar: jest.fn().mockResolvedValue(undefined),
  guardarRegistros: jest.fn().mockResolvedValue(undefined),
  buscarPorId: jest.fn().mockResolvedValue(null),
  listarRegistros: jest.fn().mockResolvedValue([])
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(container.analizarDatasetGenericoUseCase as any).auditoriaRepository = {
  registrar: jest.fn().mockResolvedValue(undefined),
  listar: jest.fn().mockResolvedValue([])
};

const app = createApp();

function tokenPara(id: string): string {
  return jwt.sign({ sub: id, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function crearXlsxConFechas(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-histograma-tiempo-'));
  const filePath = path.join(tempDir, 'incidentes.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Producto', 'FechaIncidente'],
    ['Laptop', '2024-01-15'],
    ['Mouse', '2024-01-15'],
    ['Teclado', '2024-03-10']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function subirArchivoYObtenerSesionId(token: string): Promise<string> {
  const filePath = crearXlsxConFechas();
  const res = await conHttps(
    request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
  );
  return res.body.sesionId;
}

describe('GET /analisis-datos/:sesionId/histograma-tiempo/:nombreColumna — RF-58', () => {
  const tokenA = tokenPara('analista-histograma-tiempo-A');
  const tokenB = tokenPara('analista-histograma-tiempo-B');

  test('el mismo analista que creó la sesión obtiene un SVG real con el histograma de la columna de fecha', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/histograma-tiempo/FechaIncidente`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.svg).toContain('<svg');
    expect(res.body.interpretacion).toContain('2024-01-15');
  });

  test('formato=json devuelve el análisis crudo en vez del SVG', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app)
        .get(`/analisis-datos/${sesionId}/histograma-tiempo/FechaIncidente`)
        .query({ formato: 'json' })
        .set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('fecha');
    expect(res.body.svg).toBeUndefined();
  });

  test('columna que no es de tipo fecha responde 400, no 500', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/histograma-tiempo/Producto`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(400);
  });

  test('IDOR: otro analista con un token válido no puede leer el histograma de la sesión de analista A (404, no 403)', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/histograma-tiempo/FechaIncidente`).set('Authorization', `Bearer ${tokenB}`)
    );

    expect(res.status).toBe(404);
  });

  test('un sesionId inexistente responde 404', async () => {
    const res = await conHttps(
      request(app).get('/analisis-datos/sesion-que-nunca-existio/histograma-tiempo/FechaIncidente').set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(404);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/analisis-datos/cualquier-sesion/histograma-tiempo/fecha'));
    expect(res.status).toBe(401);
  });
});
