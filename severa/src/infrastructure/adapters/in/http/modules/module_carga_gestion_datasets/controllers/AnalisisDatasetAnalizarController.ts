import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { container } from '../../../../../../config/container';
import { sanearNombreDeArchivo } from '../../../shared/sanearNombreDeArchivo';
import { DatasetGenericoNoEncontradoError } from '../../../../../../../domain/errors/DatasetGenericoNoEncontradoError';
import { ColumnaDeDatasetInvalidaError } from '../../../../../../../domain/errors/ColumnaDeDatasetInvalidaError';

// Mejora 4 (Análisis de Datos General) — Fase 2. RF-14 (Vertical Slicing,
// sección IV/V del doc de arquitectura): extraído de AnalisisDatasetController.ts
// (antes en module_medidas_tendencia_dispersion) — AnalizarDatasetGenericoUseCase
// es el punto de entrada del flujo "subo mi dataset y lo analizo", pertenece
// a M-03 (Carga y Gestión de Datasets). Mismo comportamiento, mismo endpoint,
// solo cambia el archivo. Configuración de subida PROPIA e independiente de
// DatasetController.ts a propósito (mismo criterio que el original: este
// módulo no depende del de vulnerabilidades).
export const analisisDatasetAnalizarRouter = express.Router();

// 100MB (2026-07-20, subido desde 5MB): medido en vivo que el lector actual
// (SheetJS sin streaming, ver LectorDatasetGenerico.ts) usa ~1.8GB de heap
// real con un CSV de 100MB — el mem_limit del contenedor se subió a 3g en
// docker-compose.yml específicamente para darle margen a esto.
const TAMANO_MAXIMO_BYTES = 100 * 1024 * 1024;

const MIME_TYPES_PERMITIDOS = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (y algunos navegadores mandan .csv así)
  'text/csv',
  'application/csv',
  // M-14 (RF-105): TSV/JSON no tienen un MIME estandarizado que todos los
  // navegadores/herramientas manden igual (TSV en particular: a veces
  // text/tab-separated-values, a veces text/plain, a veces
  // application/octet-stream) — por eso el filtro de abajo también acepta
  // por EXTENSIÓN, no solo por MIME. Estos MIME quedan igual en la lista
  // para los casos donde sí vienen bien formados.
  'text/tab-separated-values',
  'application/json'
]);

const EXTENSIONES_PERMITIDAS = new Set(['.xlsx', '.xls', '.csv', '.tsv', '.json']);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `severa-analisis-${randomUUID()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
  fileFilter: (_req, file, cb) => {
    // M-14 (RF-105): pasa si el MIME es uno de los conocidos O si la
    // extensión del nombre original es una de las permitidas — la validación
    // de contenido real (LectorDatasetGenerico.leerArchivo) es la red de
    // seguridad de verdad para lo que este filtro deje pasar de más (un
    // archivo con extensión .csv que en realidad no es texto delimitado
    // válido cae en DatasetInvalidoError al parsear, no acá).
    const extension = path.extname(file.originalname).toLowerCase();
    if (!MIME_TYPES_PERMITIDOS.has(file.mimetype) && !EXTENSIONES_PERMITIDAS.has(extension)) {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan .xlsx, .xls, .csv, .tsv o .json'));
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
// haya salido bien o mal. Fase 3: las filas ya parseadas SÍ quedan en el
// store efímero (sesionAnalisisStore, memoria del proceso con TTL), devueltas
// acá como `sesionId` para que las rutas de estadísticas/análisis univariado
// no requieran volver a subir el archivo.
analisisDatasetAnalizarRouter.post('/analisis-datos/analizar', manejarSubida, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Debe subir un archivo .xlsx, .xls, .csv, .tsv o .json en el campo "archivo"' });
    return;
  }

  // Del token, nunca del body — la sesión creada queda atada a este id (ver
  // SesionAnalisisStoreEnMemoria.ts), mismo criterio IDOR de Sprint 11/12.
  const analistaId = req.analistaAutenticado!.id;
  // RF-21: se sanea antes de que llegue a auditoría/al DatasetGenerico
  // persistido — mismo motivo y misma función que DatasetController.ts.
  const nombreArchivoOriginal = sanearNombreDeArchivo(req.file.originalname);

  try {
    // RF-112: perfilVariables se agrega a la misma respuesta de siempre —
    // ampliación del endpoint existente, no una ruta nueva (el reporte
    // consolidado queda "generado automáticamente tras la carga", tal como
    // pide el RF, en vez de requerir una segunda llamada aparte).
    const { diagnostico, perfilVariables, sesionId, datasetId } = await container.analizarDatasetGenericoUseCase.ejecutar(
      req.file.path,
      analistaId,
      nombreArchivoOriginal
    );
    res.json({ ...diagnostico, perfilVariables, sesionId, datasetId });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// RF-24 generalizado: exporta el dataset genérico persistido (RF-17/18/21/23)
// tal cual fue importado, sin agrupar por severidad ni ningún otro criterio
// de dominio. datasetId siempre se valida contra analistaId (ver
// ExportarDatasetGenerico.ts) — un id de otro analista responde 404, igual
// que uno inexistente.
analisisDatasetAnalizarRouter.get('/analisis-datos/:datasetId/exportar', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  try {
    const buffer = await container.exportarDatasetGenericoUseCase.ejecutar(req.params.datasetId, analistaId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    if (error instanceof DatasetGenericoNoEncontradoError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// RF-135: compara el hash SHA-256 del archivo re-subido acá contra el que se
// calculó al momento de la carga original (AnalizarDatasetGenerico.ts). No
// hay un archivo "canónico" guardado del lado del servidor para comparar
// directamente — SEVERA nunca conservó blobs, ver DatasetGenerico.ts — así
// que la verificación siempre requiere que el analista vuelva a aportar el
// archivo que quiere comprobar. Reusa el mismo multer que /analisis-datos/analizar
// (mismo límite de tamaño, mismos tipos permitidos).
analisisDatasetAnalizarRouter.post('/analisis-datos/:datasetId/verificar-integridad', manejarSubida, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Debe subir un archivo .xlsx, .xls, .csv, .tsv o .json en el campo "archivo"' });
    return;
  }

  const analistaId = req.analistaAutenticado!.id;

  try {
    const resultado = await container.verificarIntegridadDatasetUseCase.ejecutar(req.params.datasetId, analistaId, req.file.path);
    res.json(resultado);
  } catch (error) {
    if (error instanceof DatasetGenericoNoEncontradoError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// RF-139 (M-09, pieza habilitadora): el analista elige la columna a usar como
// criterio de clasificación (y, opcionalmente, la columna clave — pendiente
// de M-03, comparte esta misma ruta/plomería). Valida que la columna exista
// y que su tipo real (DetectorDeTipoDeColumna) sea apto — ver
// ConfigurarCriterioDeClasificacion.ts. No genera ranking ni filtra nada
// todavía, eso queda para una ronda futura que consuma este criterio.
analisisDatasetAnalizarRouter.patch('/analisis-datos/:datasetId/criterio-clasificacion', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const { nombreColumna, tipo, umbrales, ordenCategorias, columnaClave } = req.body;

  if (typeof nombreColumna !== 'string' || nombreColumna.trim() === '') {
    res.status(400).json({ error: 'Debe indicar "nombreColumna"' });
    return;
  }
  if (tipo !== 'numerica' && tipo !== 'ordinal') {
    res.status(400).json({ error: 'El campo "tipo" debe ser "numerica" u "ordinal"' });
    return;
  }

  try {
    const dataset = await container.configurarCriterioDeClasificacionUseCase.ejecutar(req.params.datasetId, analistaId, {
      nombreColumna,
      tipo,
      umbrales,
      ordenCategorias,
      columnaClave: typeof columnaClave === 'string' ? columnaClave : undefined
    });

    res.json({
      id: dataset.id,
      criterioClasificacion: dataset.criterioClasificacion?.toJSON() ?? null,
      columnaClave: dataset.columnaClave
    });
  } catch (error) {
    if (error instanceof DatasetGenericoNoEncontradoError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof ColumnaDeDatasetInvalidaError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
