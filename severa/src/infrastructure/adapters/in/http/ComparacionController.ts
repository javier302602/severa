import express from 'express';
import { container } from '../../../config/container';

export const comparacionRouter = express.Router();

comparacionRouter.get('/acceso', async (_req, res) => {
  const resultado = await container.compararPorTipoAccesoUseCase.ejecutar();
  res.json(resultado);
});

comparacionRouter.get('/tipo', async (req, res) => {
  const categoriaA = typeof req.query.categoriaA === 'string' ? req.query.categoriaA : 'N/A';
  const categoriaB = typeof req.query.categoriaB === 'string' ? req.query.categoriaB : 'N/A';
  const resultado = await container.compararPorTipoDeVulnerabilidadUseCase.ejecutar(categoriaA, categoriaB);
  res.json(resultado);
});

comparacionRouter.get('/software', async (req, res) => {
  const categoriaA = typeof req.query.categoriaA === 'string' ? req.query.categoriaA : 'Apache Log4j';
  const categoriaB = typeof req.query.categoriaB === 'string' ? req.query.categoriaB : 'Nginx';
  const resultado = await container.compararPorSoftwareUseCase.ejecutar(categoriaA, categoriaB);
  res.json(resultado);
});
