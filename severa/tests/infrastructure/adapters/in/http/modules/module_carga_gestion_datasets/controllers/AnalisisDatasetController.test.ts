import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';

jest.mock('../../src/infrastructure/config/container', () => ({
  container: {
    analizarDatasetGenericoUseCase: {
      ejecutar: jest.fn().mockResolvedValue({
        diagnostico: {
          totalFilas: 2,
          filasDuplicadas: 0,
          columnas: [{ nombre: 'Producto', tipo: 'categorica', valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 2, valoresInconsistentes: 0 }]
        },
        sesionId: 'sesion-mock-123'
      })
    },
    calcularEstadisticasDescriptivasGenericoUseCase: {
      ejecutar: jest.fn()
    },
    analizarColumnaUnivariadoGenericoUseCase: {
      ejecutar: jest.fn()
    }
  }
}));

import { createApp } from '../../src/infrastructure/config/app';
import { config } from '../../src/infrastructure/config/env';
import { container } from '../../src/infrastructure/config/container';

const app = createApp();

function tokenPara(id: string): string {
  return jwt.sign({ sub: id, rol: 'analista' }, config.jwtSecret, { expiresIn: '1h' });
}

function conHttps(req: request.Test): request.Test {
  return req.set('x-forwarded-proto', 'https');
}

function crearXlsxDePrueba(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-controller-'));
  const filePath = path.join(tempDir, 'ventas.xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Producto', 'Precio'],
    ['Laptop', 1200],
    ['Mouse', 25]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('AnalisisDatasetController — Mejora 4 (Análisis de Datos General) Fase 2', () => {
  const token = tokenPara('analista-A');

  test('POST /analisis-datos/analizar con un archivo válido invoca el caso de uso y responde 200 con el diagnóstico', async () => {
    const filePath = crearXlsxDePrueba();

    const res = await conHttps(
      request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(200);
    expect(res.body.totalFilas).toBe(2);
    expect(res.body.sesionId).toBe('sesion-mock-123');
    expect(container.analizarDatasetGenericoUseCase.ejecutar).toHaveBeenCalledWith(expect.any(String), 'analista-A');
  });

  test('POST /analisis-datos/analizar sin archivo devuelve 400', async () => {
    const res = await conHttps(request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`));
    expect(res.status).toBe(400);
  });

  test('POST /analisis-datos/analizar sin autenticar devuelve 401', async () => {
    // Sin adjuntar archivo: la autenticación (autenticacion, montada antes de
    // cualquier router en app.ts) corta la request antes de que multer
    // llegue a procesar el body, así que no hace falta un archivo real para
    // este caso — adjuntarlo + esperar 401 puede cortar la conexión a mitad
    // del stream multipart (ECONNRESET en el cliente de test).
    const res = await conHttps(request(app).post('/analisis-datos/analizar'));
    expect(res.status).toBe(401);
  });

  test('POST /analisis-datos/analizar con un archivo que no es Excel/CSV es rechazado', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severa-analisis-controller-'));
    const filePath = path.join(tempDir, 'no-es-dataset.pdf');
    fs.writeFileSync(filePath, 'esto no es un dataset');

    const res = await conHttps(
      request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(400);
  });

  test('cuando el caso de uso rechaza (archivo corrupto) responde 400 con el mensaje claro, no 500', async () => {
    (container.analizarDatasetGenericoUseCase.ejecutar as jest.Mock).mockRejectedValueOnce(
      new Error('El archivo está corrupto o no es un Excel/CSV válido')
    );
    const filePath = crearXlsxDePrueba();

    const res = await conHttps(
      request(app).post('/analisis-datos/analizar').set('Authorization', `Bearer ${token}`).attach('archivo', filePath)
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El archivo está corrupto o no es un Excel/CSV válido');
  });
});
