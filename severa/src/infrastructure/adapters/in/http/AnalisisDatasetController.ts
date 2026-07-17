import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { container } from '../../../config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 2/3/4/5. Módulo NUEVO y separado del
// resto de SEVERA: rutas propias bajo /analisis-datos/..., nunca
// /dataset/... (ese prefijo es del módulo de vulnerabilidades y no debe
// confundirse con este). Configuración de subida PROPIA e independiente de
// DatasetController.ts a propósito — aunque se parece, se duplica
// deliberadamente en vez de compartirla, para que este módulo no dependa en
// absoluto del de vulnerabilidades (ver decisión confirmada: "módulo nuevo y
// separado, no toca nada de lo que ya existe").
export const analisisDatasetRouter = express.Router();

const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

const MIME_TYPES_PERMITIDOS = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (y algunos navegadores mandan .csv así)
  'text/csv',
  'application/csv'
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `severa-analisis-${randomUUID()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!MIME_TYPES_PERMITIDOS.has(file.mimetype)) {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan .xlsx, .xls o .csv'));
      return;
    }
    cb(null, true);
  }
});

function manejarSubida(req: express.Request, res: express.Response, next: express.NextFunction): void {
  upload.single('archivo')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `El archivo excede el tamaño máximo permitido (${TAMANO_MAXIMO_BYTES / (1024 * 1024)} MB)` });
      return;
    }
    if (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Error al subir el archivo' });
      return;
    }
    next();
  });
}

// Sin persistencia en base de datos (decisión confirmada para v1 del
// módulo): analiza el archivo en el momento de subirlo y no guarda ninguna
// fila ahí — el archivo temporal se borra apenas termina de procesarse,
// haya salido bien o mal, igual que en DatasetController.ts. Fase 3: las
// filas ya parseadas SÍ quedan en el store efímero (sesionAnalisisStore,
// memoria del proceso con TTL), devueltas acá como `sesionId` para que las
// rutas de estadísticas/análisis univariado no requieran volver a subir el
// archivo.
analisisDatasetRouter.post('/analisis-datos/analizar', manejarSubida, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Debe subir un archivo .xlsx, .xls o .csv en el campo "archivo"' });
    return;
  }

  // Del token, nunca del body — la sesión creada queda atada a este id (ver
  // SesionAnalisisStoreEnMemoria.ts), mismo criterio IDOR de Sprint 11/12.
  const analistaId = req.analistaAutenticado!.id;

  try {
    const { diagnostico, sesionId } = await container.analizarDatasetGenericoUseCase.ejecutar(req.file.path, analistaId);
    res.json({ ...diagnostico, sesionId });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// Fase 3: reciben sesionId (no un archivo) en la URL. analistaId sale
// siempre del token — el store verifica que el sesionId le pertenezca antes
// de devolver nada; si no existe, expiró, o es de otro analista, responde
// 404 sin distinguir el motivo (SesionAnalisisNoEncontradaError), nunca 403.
analisisDatasetRouter.get('/analisis-datos/:sesionId/estadisticas-descriptivas', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  try {
    const columnas = await container.calcularEstadisticasDescriptivasGenericoUseCase.ejecutar(analistaId, req.params.sesionId);
    res.json({ columnas });
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// nombreColumna viaja en la URL (no en query) para que sea inequívoco que
// identifica un recurso ("la columna X de esta sesión"); el frontend debe
// codificarlo con encodeURIComponent porque los nombres de columna de un
// dataset real suelen tener espacios u otros caracteres no válidos en una URL.
analisisDatasetRouter.get('/analisis-datos/:sesionId/univariado/:nombreColumna', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  try {
    const analisis = await container.analizarColumnaUnivariadoGenericoUseCase.ejecutar(
      analistaId,
      req.params.sesionId,
      req.params.nombreColumna
    );
    res.json(analisis);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// Fase 4: matriz de correlación de Pearson entre todas las columnas
// numéricas de la sesión. Devuelve los datos crudos de la matriz (filas x
// columnas x valor) para que el FRONTEND arme el heatmap — este endpoint no
// genera ninguna imagen. Las columnas que no califican (no numéricas, o
// numéricas con menos de 2 valores válidos) no rompen la respuesta: quedan
// listadas aparte en `columnasExcluidas` con el motivo.
analisisDatasetRouter.get('/analisis-datos/:sesionId/correlacion', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  try {
    const matriz = await container.calcularMatrizCorrelacionGenericoUseCase.ejecutar(analistaId, req.params.sesionId);
    res.json(matriz);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// Fase 4: valores atípicos por columna numérica (criterio 1.5×IQR). Mismo
// criterio que /correlacion para columnas que no califican: excluidas con
// motivo, no una excepción que tire abajo toda la respuesta.
analisisDatasetRouter.get('/analisis-datos/:sesionId/outliers', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  try {
    const resultado = await container.detectarOutliersGenericoUseCase.ejecutar(analistaId, req.params.sesionId);
    res.json(resultado);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

const CONTENT_TYPE_INFORME_POR_FORMATO: Record<'pdf' | 'docx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Fase 5: informe completo del dataset de la sesión (mismo criterio IDOR,
// mismo formato de query param que /informes/completo del módulo de
// vulnerabilidades — ver InformeController.ts).
analisisDatasetRouter.get('/analisis-datos/:sesionId/informe', async (req, res) => {
  const formato = req.query.formato;
  if (formato !== 'pdf' && formato !== 'docx') {
    res.status(400).json({ error: 'Parámetro "formato" inválido. Valores permitidos: pdf, docx.' });
    return;
  }

  const analistaId = req.analistaAutenticado!.id;

  try {
    const buffer = await container.generarInformeDatasetUseCase.ejecutar(analistaId, req.params.sesionId, formato);
    res.setHeader('Content-Type', CONTENT_TYPE_INFORME_POR_FORMATO[formato]);
    res.send(buffer);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
