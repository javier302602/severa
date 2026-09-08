import express from 'express';
import { container } from '../../../../../../config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../domain/errors/SesionAnalisisNoEncontradaError';

// RF-58 (M-07, Mejora 4 — Fase 3/4): histograma de una columna de tipo
// fecha/tiempo de un dataset genérico. Deliberadamente separado de
// GraficoController.ts (CVSS/module_priorizacion_clasificacion) — ver
// auditoría SDS M-07: la carpeta indica el módulo del SDS al que pertenece
// (Visualización Gráfica), no la fuente de datos (que es la misma
// sesionAnalisisStore que ya usan las rutas de Fase 3/4 de M-06).
export const analisisDatasetHistogramaTiempoRouter = express.Router();

analisisDatasetHistogramaTiempoRouter.get('/analisis-datos/:sesionId/histograma-tiempo/:nombreColumna', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const formato = req.query.formato === 'json' ? 'json' : 'svg';

  try {
    const resultado = await container.generarHistogramaDeTiempoGenericoUseCase.ejecutar(
      analistaId,
      req.params.sesionId,
      req.params.nombreColumna,
      formato
    );
    res.json(resultado);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
