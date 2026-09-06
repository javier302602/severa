import express from 'express';
import { container } from '../../../../../../config/container';

export const estadisticaRouter = express.Router();

estadisticaRouter.get('/resumen', async (req, res) => {
  const resultado = await container.calcularResumenEstadisticoUseCase.ejecutar(req.analistaAutenticado!.id);
  res.json(resultado);
});

// GET /estadistica/frecuencias se movio a DistribucionFrecuenciasController.ts
// (module_distribucion_frecuencias, M-05) — GenerarDistribucionFrecuenciasUseCase
// pertenece a ese modulo, no a M-06. Sigue montado bajo el mismo prefijo
// '/estadistica' en app.ts, mismo comportamiento.
