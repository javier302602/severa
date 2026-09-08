import express from 'express';
import { container } from '../../../../../../config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../domain/errors/SesionAnalisisNoEncontradaError';

// M-15 (RF-114/RF-116/RF-117), Ronda 1. Mismo patrón que
// AnalisisDatasetOutliersController.ts: GET sobre sesionId, parámetros
// configurables como query params planos (mismo estilo que
// incluirIdentificadores/numeroDeIntervalos), analistaId siempre del token.
export const analisisDatasetCalidadRouter = express.Router();

analisisDatasetCalidadRouter.get('/analisis-datos/:sesionId/calidad', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  const umbralFilaIncompleta = req.query.umbralFilaIncompleta !== undefined ? Number(req.query.umbralFilaIncompleta) : undefined;
  // RF-116: lista separada por comas (ej. "id,email"); sin el query param,
  // el caso de uso usa todas las columnas del dataset.
  const columnasClave =
    typeof req.query.columnasClave === 'string'
      ? req.query.columnasClave
          .split(',')
          .map((columna) => columna.trim())
          .filter((columna) => columna.length > 0)
      : undefined;
  // RF-117: una columna por llamada (rangoColumna/rangoMin/rangoMax) — ver
  // el caso de uso para la validación completa (columna existe, es
  // numérica, rangoMinimo <= rangoMaximo).
  const rangoColumna = typeof req.query.rangoColumna === 'string' ? req.query.rangoColumna : undefined;
  const rangoMinimo = req.query.rangoMin !== undefined ? Number(req.query.rangoMin) : undefined;
  const rangoMaximo = req.query.rangoMax !== undefined ? Number(req.query.rangoMax) : undefined;

  try {
    const resultado = await container.analizarCalidadDatasetGenericoUseCase.ejecutar(analistaId, req.params.sesionId, {
      umbralFilaIncompleta,
      columnasClave,
      rangoColumna,
      rangoMinimo,
      rangoMaximo
    });
    res.json(resultado);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
