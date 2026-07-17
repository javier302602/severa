import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';

// Mejora 4 (Análisis de Datos General) — Fase 3/4/5. A diferencia de
// AnalisisDatasetController.test.ts (que mockea todo el container para
// probar el controller en aislamiento), acá NO se mockea el container: se
// ejercita el flujo real completo (subir archivo -> sesionId real en
// SesionAnalisisStoreEnMemoria -> leer estadísticas/univariado/correlación/
// outliers con ese sesionId) porque lo que hay que probar es precisamente
// que el store real aplica la verificación de dueño (IDOR) de punta a punta
// a través de la API HTTP, no solo a nivel unitario del store o del caso de
// uso. Nada acá toca la base de datos (mismo motivo que Cors.test.ts: Pool
// de pg es perezoso, no conecta hasta la primera query, y estas rutas no
// hacen ninguna).
const app = createApp();

function tokenPara(id: string): string {
  return jwt.sign({ sub: id, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function crearXlsxDePrueba(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-fase3-'));
  const filePath = path.join(tempDir, 'ventas.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Producto', 'Precio'],
    ['Laptop', 1200],
    ['Mouse', 25],
    ['Teclado', 45]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function subirArchivoYObtenerSesionId(token: string): Promise<string> {
  const filePath = crearXlsxDePrueba();
  const res = await conHttps(
    request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
  );
  return res.body.sesionId;
}

// Fase 4: dataset propio con DOS columnas numéricas en relación lineal
// exacta (Cantidad = 10×Precio) — correlación de Pearson debe dar 1 sin
// importar la magnitud de los valores, así que el mismo dataset sirve para
// probar la matriz de correlación Y para tener un outlier claro (la última
// fila, 100, muy por fuera del resto). Producto queda como columna no
// numérica, para probar que se excluye de ambos endpoints con un motivo.
function crearXlsxParaCorrelacionYOutliers(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-fase4-'));
  const filePath = path.join(tempDir, 'ventas-numericas.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Producto', 'Precio', 'Cantidad'],
    ['A', 10, 100],
    ['B', 12, 120],
    ['C', 11, 110],
    ['D', 13, 130],
    ['E', 12, 120],
    ['F', 100, 1000]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function subirArchivoNumericoYObtenerSesionId(token: string): Promise<string> {
  const filePath = crearXlsxParaCorrelacionYOutliers();
  const res = await conHttps(
    request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
  );
  return res.body.sesionId;
}

describe('Rutas de Fase 3 (estadísticas descriptivas / univariado por sesionId) — flujo real, sin mockear el container', () => {
  const tokenA = tokenPara('analista-fase3-A');
  const tokenB = tokenPara('analista-fase3-B');

  test('el mismo analista que creó la sesión puede leer sus estadísticas descriptivas', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/estadisticas-descriptivas`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.columnas).toHaveLength(2);
    const precio = res.body.columnas.find((c: { nombre: string }) => c.nombre === 'Precio');
    expect(precio.tipo).toBe('numerica');
  });

  test('IDOR: otro analista con un token válido no puede leer la sesión de analista A (404, no 403)', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/estadisticas-descriptivas`).set('Authorization', `Bearer ${tokenB}`)
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Sesión de análisis no encontrada o expirada, volvé a subir el archivo');
  });

  test('IDOR: mismo criterio en la ruta de análisis univariado', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/univariado/Precio`).set('Authorization', `Bearer ${tokenB}`)
    );

    expect(res.status).toBe(404);
  });

  test('un sesionId inexistente responde 404 (mismo mensaje que uno de otro analista, no distingue el motivo)', async () => {
    const res = await conHttps(
      request(app).get('/analisis-datos/sesion-que-nunca-existio/estadisticas-descriptivas').set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(404);
  });

  test('análisis univariado de una columna existente responde 200 con el detalle', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/univariado/Precio`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('numerica');
    expect(res.body.nombre).toBe('Precio');
    expect(res.body.resumenCincoNumeros.minimo).toBe(25);
    expect(res.body.resumenCincoNumeros.maximo).toBe(1200);
  });

  test('análisis univariado de una columna que no existe en el dataset responde 400, no 500', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/univariado/ColumnaQueNoExiste`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(400);
  });

  test('sin autenticar, ambas rutas devuelven 401', async () => {
    const resEstadisticas = await conHttps(request(app).get('/analisis-datos/cualquier-sesion/estadisticas-descriptivas'));
    const resUnivariado = await conHttps(request(app).get('/analisis-datos/cualquier-sesion/univariado/Precio'));

    expect(resEstadisticas.status).toBe(401);
    expect(resUnivariado.status).toBe(401);
  });
});

describe('Rutas de Fase 4 (correlación / outliers por sesionId) — flujo real, sin mockear el container', () => {
  const tokenA = tokenPara('analista-fase4-A');
  const tokenB = tokenPara('analista-fase4-B');

  test('matriz de correlación: incluye solo columnas numéricas y excluye Producto con motivo', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/correlacion`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.columnas.sort()).toEqual(['Cantidad', 'Precio']);
    expect(res.body.columnasExcluidas).toEqual([{ nombre: 'Producto', motivo: 'La columna no es numérica' }]);

    const filaPrecio = res.body.filas.find((f: { columna: string }) => f.columna === 'Precio');
    const celdaCantidad = filaPrecio.correlaciones.find((c: { columna: string }) => c.columna === 'Cantidad');
    expect(celdaCantidad.valor).toBeCloseTo(1, 5);

    const celdaDiagonal = filaPrecio.correlaciones.find((c: { columna: string }) => c.columna === 'Precio');
    expect(celdaDiagonal.valor).toBe(1);
  });

  test('IDOR: otro analista no puede leer la matriz de correlación de la sesión de analista A', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/correlacion`).set('Authorization', `Bearer ${tokenB}`)
    );

    expect(res.status).toBe(404);
  });

  test('outliers: detecta el valor atípico de Precio (1.5×IQR) y excluye Producto', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(request(app).get(`/analisis-datos/${sesionId}/outliers`).set('Authorization', `Bearer ${tokenA}`));

    expect(res.status).toBe(200);
    expect(res.body.columnasExcluidas).toEqual([{ nombre: 'Producto', motivo: 'La columna no es numérica' }]);

    const precio = res.body.columnas.find((c: { columna: string }) => c.columna === 'Precio');
    expect(precio.cantidadValoresAtipicos).toBe(1);
    expect(precio.valoresAtipicos).toEqual([{ filaIndice: 5, valor: 100 }]);
  });

  test('IDOR: otro analista no puede leer los outliers de la sesión de analista A', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(request(app).get(`/analisis-datos/${sesionId}/outliers`).set('Authorization', `Bearer ${tokenB}`));

    expect(res.status).toBe(404);
  });

  test('sin autenticar, ambas rutas nuevas devuelven 401', async () => {
    const resCorrelacion = await conHttps(request(app).get('/analisis-datos/cualquier-sesion/correlacion'));
    const resOutliers = await conHttps(request(app).get('/analisis-datos/cualquier-sesion/outliers'));

    expect(resCorrelacion.status).toBe(401);
    expect(resOutliers.status).toBe(401);
  });
});

describe('Ruta de Fase 5 (informe por sesionId) — flujo real, sin mockear el container', () => {
  const tokenA = tokenPara('analista-fase5-A');
  const tokenB = tokenPara('analista-fase5-B');

  test('formato=pdf genera un PDF real (empieza con la firma %PDF)', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/informe`).query({ formato: 'pdf' }).set('Authorization', `Bearer ${tokenA}`)
    ).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  test('formato=docx genera un .docx real (firma de zip "PK")', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/informe`).query({ formato: 'docx' }).set('Authorization', `Bearer ${tokenA}`)
    ).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect((res.body as Buffer).subarray(0, 2).toString('ascii')).toBe('PK');
  });

  test('formato inválido responde 400', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/informe`).query({ formato: 'xml' }).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(400);
  });

  test('IDOR: otro analista no puede generar el informe de la sesión de analista A', async () => {
    const sesionId = await subirArchivoNumericoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/informe`).query({ formato: 'pdf' }).set('Authorization', `Bearer ${tokenB}`)
    );

    expect(res.status).toBe(404);
  });

  test('sesionId inexistente responde 404', async () => {
    const res = await conHttps(
      request(app).get('/analisis-datos/no-existe/informe').query({ formato: 'pdf' }).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(404);
  });

  test('sin autenticar devuelve 401', async () => {
    const res = await conHttps(request(app).get('/analisis-datos/cualquier-sesion/informe').query({ formato: 'pdf' }));
    expect(res.status).toBe(401);
  });
});
