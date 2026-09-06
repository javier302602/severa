import express from 'express';
import { container } from '../../../../../../config/container';

// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): extraído de
// EstadisticaController.ts (module_medidas_tendencia_dispersion) —
// GenerarDistribucionFrecuenciasUseCase pertenece a M-05 (Distribución de
// Frecuencias), no a M-06. Sigue montado bajo el mismo prefijo '/estadistica'
// en app.ts. Mismo comportamiento, mismo endpoint, solo cambia el archivo.
export const distribucionFrecuenciasRouter = express.Router();

distribucionFrecuenciasRouter.get('/frecuencias', async (req, res) => {
  const tipo = req.query.tipo === 'agrupada' ? 'agrupada' : 'sinAgrupar';
  const resultado = await container.generarDistribucionFrecuenciasUseCase.ejecutar(tipo, req.analistaAutenticado!.id);
  res.json(resultado);
});
