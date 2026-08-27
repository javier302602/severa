import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { container } from '../../../config/container';
import { MapeoColumnas } from '../../out/dataset/LectorExcelDataset';

// RF-17/RF-24: separado de VulnerabilidadController (catálogo/consulta de
// vulnerabilidades ya cargadas, Módulo M-04 del SDS) porque carga y
// exportación del dataset son el Módulo M-03 — misma frontera que ya separa
// BusquedaController de VulnerabilidadController.
export const datasetRouter = express.Router();

// RF-17 + Sprint 10 (xlsx identificado como superficie sensible: zip bombs,
// expansión de entidades, archivos corruptos): límite de tamaño como defensa
// en profundidad, además de la validación de estructura que ya hace
// LectorExcelDataset (RF-97). El dataset de referencia del SDS es de 150
// registros (unos cientos de KB); 5 MB da margen real sin dejar subir
// archivos arbitrariamente grandes.
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

// Se invoca `upload.single(...)` manualmente (en vez de pasarlo como
// middleware de Express con app.use/router.post directo) para capturar sus
// errores (tamaño excedido, tipo rechazado) como JSON coherente con el resto
// de la API, sin depender de un error-handler global que este proyecto no tiene.
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

const CAMPOS_MAPEO_COLUMNAS = ['cve', 'cvssScore', 'software', 'tipoVulnerabilidad', 'accesoRemoto', 'diasParaParche'] as const;

// Filtra un objeto candidato a solo las claves conocidas de MapeoColumnas con
// valor string no vacío — compartido por parseMapeoColumnas (mapeo viaja como
// JSON serializado dentro de multipart/form-data, ver abajo) y por
// /dataset/importar-url (mapeo viaja directo como objeto en el body JSON,
// sin necesitar un JSON.parse extra).
function extraerMapeoColumnasValido(candidato: unknown): MapeoColumnas | undefined {
  if (typeof candidato !== 'object' || candidato === null || Array.isArray(candidato)) {
    return undefined;
  }

  const mapeo: MapeoColumnas = {};
  for (const [clave, valor] of Object.entries(candidato)) {
    if (!(CAMPOS_MAPEO_COLUMNAS as readonly string[]).includes(clave)) {
      continue;
    }
    if (typeof valor === 'string' && valor.trim() !== '') {
      mapeo[clave as (typeof CAMPOS_MAPEO_COLUMNAS)[number]] = valor;
    }
  }

  return Object.keys(mapeo).length > 0 ? mapeo : undefined;
}

// El mapeo viaja como un campo de texto más dentro del mismo
// multipart/form-data que el archivo (multer lo deja en req.body, igual que
// cualquier campo no-archivo) — se manda como JSON serializado porque
// multipart no tiene un tipo "objeto" nativo. Se valida forma acá, antes de
// pasarlo a LectorExcelDataset: un JSON malformado o con valores que no sean
// string no debe llegar al lector.
function parseMapeoColumnas(raw: unknown): MapeoColumnas | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return undefined;
  }

  let parseado: unknown;
  try {
    parseado = JSON.parse(raw);
  } catch {
    throw new Error('El mapeo de columnas no es JSON válido');
  }

  if (typeof parseado !== 'object' || parseado === null || Array.isArray(parseado)) {
    throw new Error('El mapeo de columnas debe ser un objeto');
  }

  return extraerMapeoColumnasValido(parseado);
}

const LARGO_MAXIMO_NOMBRE_ARCHIVO = 200;

function sanearNombreDeArchivo(nombre: string): string {
  const sinSaltosDeLinea = nombre.replace(/[\r\n]+/g, ' ').trim();
  return sinSaltosDeLinea.slice(0, LARGO_MAXIMO_NOMBRE_ARCHIVO);
}

// Mejora "mapeo flexible de columnas": el frontend llama a esto apenas el
// usuario elige el archivo, antes de mostrar el formulario de mapeo — reusa
// el mismo `manejarSubida` (límite de tamaño, tipo MIME) que /dataset/importar
// para no duplicar esas reglas en dos endpoints.
datasetRouter.post('/dataset/columnas', manejarSubida, async (req, res) => {
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

datasetRouter.post('/dataset/importar', manejarSubida, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Debe subir un archivo .xlsx o .xls en el campo "archivo"' });
    return;
  }

  const analistaId = req.analistaAutenticado!.id;

  try {
    const mapeoColumnas = parseMapeoColumnas(req.body.mapeoColumnas);
    // Se sanea antes de que llegue a auditoría/informe: es texto libre
    // provisto por quien sube el archivo (el nombre del .xlsx en su propia
    // máquina), nunca debe poder inyectar un salto de línea en el registro
    // de auditoría ni inflarlo con un nombre arbitrariamente largo.
    const nombreArchivoOriginal = sanearNombreDeArchivo(req.file.originalname);
    const resumen = await container.importarDatasetDesdeArchivoUseCase.ejecutar(
      req.file.path,
      analistaId,
      mapeoColumnas,
      nombreArchivoOriginal
    );
    res.status(201).json(resumen);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// Bug real reportado: la descarga era CSV plano, "un solo cuadro sin
// separación visual" — ahora es un .xlsx real agrupado por severidad, con
// color y celdas fusionadas por bloque (ver ExportadorExcelAgrupado.ts).
datasetRouter.get('/dataset/exportar', async (req, res) => {
  const buffer = await container.exportarDatasetValidadoUseCase.ejecutar(req.analistaAutenticado!.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// RF nuevo (Sprint 17): importar pegando un link en vez de subir un archivo.
// Toda la defensa contra SSRF (allowlist de hosts, resolución de IP,
// redirecciones, tamaño) vive en DetectorDeTipoDeLink/DescargadorDeArchivosHttp
// — este controller no valida nada de eso, solo delega y traduce el error a
// 400 con un mensaje claro.
datasetRouter.post('/dataset/importar-url', async (req, res) => {
  const { url } = req.body;

  if (typeof url !== 'string' || url.trim() === '') {
    res.status(400).json({ error: 'Debe indicar una URL en el campo "url"' });
    return;
  }

  const analistaId = req.analistaAutenticado!.id;

  try {
    // mapeoColumnas (2026-07-17): mismo mapeo flexible que "subir archivo" —
    // ningún dataset público real trae las columnas con los nombres exactos
    // que espera SEVERA por defecto. Acá viaja directo como objeto (JSON
    // body, no multipart), sin el JSON.parse que sí hace falta arriba.
    const mapeoColumnas = extraerMapeoColumnasValido(req.body.mapeoColumnas);
    const resumen = await container.importarDatasetDesdeUrlUseCase.ejecutar(url, analistaId, mapeoColumnas);
    res.status(201).json(resumen);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// "Restablecer mis datos": borra SOLO las vulnerabilidades del analista
// autenticado. Acción DESTRUCTIVA e irreversible, pero ya NO requiere un rol
// especial — con la multi-tenancy de este módulo (migración 006), cada
// analista únicamente puede borrar su propio catálogo (ver
// PostgresVulnerabilidadRepository.eliminarTodas, acotado por analista_id),
// nunca el de otro. Alcanza con estar autenticado (AutenticacionMiddleware,
// ya aplicado globalmente antes de este router — ver app.ts).
datasetRouter.delete('/dataset/reiniciar', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const resumen = await container.reiniciarDatasetUseCase.ejecutar(analistaId);
  res.json(resumen);
});

// Sección Informes: "convertir link a Excel" — mismas reglas de seguridad
// que /dataset/importar-url (allowlist + resolución de IP en
// DetectorDeTipoDeLink/DescargadorDeArchivosHttp), pero sin persistir nada:
// el resultado es un .xlsx para descargar directamente, no un catálogo
// importado.
datasetRouter.post('/dataset/convertir-url-a-excel', async (req, res) => {
  const { url } = req.body;

  if (typeof url !== 'string' || url.trim() === '') {
    res.status(400).json({ error: 'Debe indicar una URL en el campo "url"' });
    return;
  }

  try {
    // formato (2026-07-19): un archivo que excede el límite seguro de
    // conversión a .xlsx se sirve como CSV crudo (ver ConvertirUrlAExcel.ts)
    // — el header le dice al frontend con qué extensión/tipo real está
    // bajando el archivo, en vez de asumir siempre .xlsx.
    const { buffer, formato } = await container.convertirUrlAExcelUseCase.ejecutar(url);
    res.setHeader(
      'Content-Type',
      formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'
    );
    res.setHeader('X-Formato-Archivo', formato);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
