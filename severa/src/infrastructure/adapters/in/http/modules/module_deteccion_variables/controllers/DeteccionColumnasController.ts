import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { container } from '../../../../../../config/container';

// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): extraído de
// DatasetController.ts (module_carga_gestion_datasets) — DetectarColumnasDatasetUseCase
// pertenece a M-14 (Motor de Detección Automática de Variables), no a M-03.
// Mismo comportamiento, mismo endpoint, solo cambia el archivo.
export const deteccionColumnasRouter = express.Router();

const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

const MIME_TYPES_PERMITIDOS = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // .xls
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `severa-import-${randomUUID()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!MIME_TYPES_PERMITIDOS.has(file.mimetype)) {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan .xlsx o .xls'));
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

// Mejora "mapeo flexible de columnas": el frontend llama a esto apenas el
// usuario elige el archivo, antes de mostrar el formulario de mapeo.
deteccionColumnasRouter.post('/dataset/columnas', manejarSubida, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Debe subir un archivo .xlsx o .xls en el campo "archivo"' });
    return;
  }

  try {
    const columnas = await container.detectarColumnasDatasetUseCase.ejecutar(req.file.path);
    res.json({ columnas });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});
