import express from 'express';
import { container } from '../../../../../../config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 4. RF-14 (Vertical Slicing,
// sección IV/V del doc de arquitectura): extraído de AnalisisDatasetController.ts
// (module_medidas_tendencia_dispersion) — el SDS define M-15 (Limpieza y
// Calidad de Datos) explícitamente como detección de outliers, faltantes,
// duplicados y formatos inconsistentes. Mismo comportamiento, mismo
// endpoint, solo cambia el archivo.
export const analisisDatasetOutliersRouter = express.Router();

// Valores atípicos por columna numérica (criterio 1.5×IQR). analistaId sale
// siempre del token — el store verifica que el sesionId le pertenezca antes
// de devolver nada; si no existe, expiró, o es de otro analista, responde
// 404 sin distinguir el motivo (SesionAnalisisNoEncontradaError), nunca 403.
analisisDatasetOutliersRouter.get('/analisis-datos/:sesionId/outliers', async (req, res) => {
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
