import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { createApp } from '../../../../../../../../src/infrastructure/config/app';
import { config } from '../../../../../../../../src/infrastructure/config/env';
import { container } from '../../../../../../../../src/infrastructure/config/container';

// Mejora 4 (Análisis de Datos General) — Fase 3/4/5. A diferencia de
// AnalisisDatasetController.test.ts (que mockea todo el container para
// probar el controller en aislamiento), acá NO se mockea el container: se
// ejercita el flujo real completo (subir archivo -> sesionId real en
// SesionAnalisisStoreEnMemoria -> leer estadísticas/univariado/correlación/
// outliers con ese sesionId) porque lo que hay que probar es precisamente
// que el store real aplica la verificación de dueño (IDOR) de punta a punta
// a través de la API HTTP, no solo a nivel unitario del store o del caso de
// uso. El resto de estas rutas sigue sin tocar la base de datos (Pool de pg
// es perezoso, no conecta hasta la primera query).
//
// Generalización de M-03 (RF-17/21/23): AnalizarDatasetGenerico ahora
// TAMBIÉN persiste en datasets_genericos/registros_datasets_genericos (ver
// PostgresDatasetGenericoRepository), y su decorador de auditoría
// (AnalizarDatasetGenericoConAuditoria) escribe en registros_auditoria —
// ambas cosas requerirían una base de datos real. Se reemplazan SOLO esas
// dos dependencias por fakes en memoria (`as any` porque son campos
// privados a nivel de TypeScript, no en runtime), dejando intacta la cadena
// real que este archivo necesita probar (mismo sesionAnalisisStore
// compartido con las demás rutas de Fase 3/4/5).
const app = createApp();
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
// Bug real encontrado auditando M-10 (no era "una limitación de LibreOffice/
// soffice" como se venía asumiendo — esa explicación era incorrecta: no hay
// ninguna dependencia de soffice en todo el proyecto). La causa real: los dos
// tests de "Fase 5 (informe por sesionId)" de más abajo pasan por
// GenerarInformeDataset.ejecutar -> resolverNombreAnalistaParaInforme ->
// PostgresAnalistaRepository.buscarPorId real — el único de los tres
// repositorios de esa cadena que este archivo NO reemplazaba por un fake en
// memoria (a diferencia de datasetGenericoRepository/auditoriaRepository de
// arriba), así que sin una Postgres real corriendo fallaban con
// ECONNREFUSED, envuelto en un 400 genérico ("Error desconocido") por el
// catch-all de AnalisisDatasetInformeController.ts. Mismo criterio que los
// otros dos: buscarPorId resuelve null a propósito (el nombre del analista
// en la portada del PDF/Word no es lo que estos tests verifican) para que
// resolverNombreAnalistaParaInforme caiga a su fallback ('Analista SEVERA')
// sin tocar la base de datos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(container.generarInformeDatasetUseCase as any).analistaRepository = {
  guardar: jest.fn().mockResolvedValue(undefined),
  buscarPorCorreo: jest.fn().mockResolvedValue(null),
  buscarPorId: jest.fn().mockResolvedValue(null),
  eliminar: jest.fn().mockResolvedValue(undefined)
};

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

// M-14 (RF-109): SKU es una columna con valores únicos por fila (5 filas,
// suficiente para superar MINIMO_MUESTRA_IDENTIFICADOR) — sirve para probar
// de punta a punta que /estadisticas-descriptivas la excluye por defecto.
function crearXlsxConIdentificador(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-fase3-id-'));
  const filePath = path.join(tempDir, 'con-id.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['SKU', 'Precio'],
    ['SKU-0001', 1200],
    ['SKU-0002', 25],
    ['SKU-0003', 45],
    ['SKU-0004', 300],
    ['SKU-0005', 150]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function subirArchivoConIdentificadorYObtenerSesionId(token: string): Promise<string> {
  const filePath = crearXlsxConIdentificador();
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

  // M-14 (RF-109): de punta a punta, sin mockear nada — el flujo real
  // subir -> pedir estadísticas descriptivas realmente excluye/incluye SKU
  // según el query param.
  test('RF-109: por defecto excluye la columna identificador (SKU) de las estadísticas descriptivas', async () => {
    const sesionId = await subirArchivoConIdentificadorYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app).get(`/analisis-datos/${sesionId}/estadisticas-descriptivas`).set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.columnas.map((c: { nombre: string }) => c.nombre)).toEqual(['Precio']);
  });

  test('RF-109: con incluirIdentificadores=true, SKU vuelve a aparecer', async () => {
    const sesionId = await subirArchivoConIdentificadorYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app)
        .get(`/analisis-datos/${sesionId}/estadisticas-descriptivas`)
        .query({ incluirIdentificadores: 'true' })
        .set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.columnas.map((c: { nombre: string }) => c.nombre).sort()).toEqual(['Precio', 'SKU']);
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

  // RF-39: override manual del número de intervalos vía query param.
  test('univariado con numeroDeIntervalos manual válido devuelve esa cantidad de bins', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app)
        .get(`/analisis-datos/${sesionId}/univariado/Precio`)
        .query({ numeroDeIntervalos: 2 })
        .set('Authorization', `Bearer ${tokenA}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.distribucion).toHaveLength(2);
  });

  test('univariado con numeroDeIntervalos inválido responde 400, no 500', async () => {
    const sesionId = await subirArchivoYObtenerSesionId(tokenA);

    const res = await conHttps(
      request(app)
        .get(`/analisis-datos/${sesionId}/univariado/Precio`)
        .query({ numeroDeIntervalos: 0 })
        .set('Authorization', `Bearer ${tokenA}`)
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
