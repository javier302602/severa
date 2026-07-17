import express from 'express';
import { container } from '../../../config/container';

export const estadisticaRouter = express.Router();

estadisticaRouter.get('/resumen', async (_req, res) => {
  const resultado = await container.calcularResumenEstadisticoUseCase.ejecutar();
  res.json(resultado);
});

estadisticaRouter.get('/frecuencias', async (req, res) => {
  const tipo = req.query.tipo === 'agrupada' ? 'agrupada' : 'sinAgrupar';
  const resultado = await container.generarDistribucionFrecuenciasUseCase.ejecutar(tipo);
  res.json(resultado);
});
