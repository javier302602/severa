import express from 'express';
import { container } from '../../../../../../config/container';
import { responderErrorDeAnalisisDeDatos } from '../../../shared/responderErrorDeAnalisisDeDatos';

// RF-136 (M-12): versiones de un dataset. "El analista puede consultar y
// recuperar versiones anteriores":
//   consultar  = GET /analisis-datos/datasets y GET .../:datasetId/versiones
//   recuperar  = POST .../:datasetId/abrir, que vuelve a dejar esa versión
//                lista para analizar (o para limpiarla de otra manera)
// Recuperar no copia ni pisa nada: una versión guardada es inmutable
// (RF-137), abrirla es solo volver a cargarla en una sesión de análisis.
export const analisisDatasetVersionesRouter = express.Router();

// Los datasets del analista, uno por archivo cargado, con cuántas versiones
// procesadas tiene cada uno. Ruta de dos segmentos: no choca con las de
// /analisis-datos/:id/algo, que siempre tienen tres.
analisisDatasetVersionesRouter.get('/analisis-datos/datasets', async (req, res) => {
  try {
    res.json(await container.listarDatasetsGenericosUseCase.ejecutar(req.analistaAutenticado!.id));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// Todas las versiones de la familia a la que pertenece :datasetId (sirve el
// id del original o el de cualquier versión), con las operaciones que dieron
// origen a cada una.
analisisDatasetVersionesRouter.get('/analisis-datos/:datasetId/versiones', async (req, res) => {
  try {
    res.json(await container.listarVersionesDeDatasetUseCase.ejecutar(req.analistaAutenticado!.id, req.params.datasetId));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// POST: crea una sesión de análisis nueva (un recurso efímero, con su TTL).
analisisDatasetVersionesRouter.post('/analisis-datos/:datasetId/abrir', async (req, res) => {
  try {
    res.status(201).json(await container.abrirDatasetGenericoUseCase.ejecutar(req.analistaAutenticado!.id, req.params.datasetId));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});
