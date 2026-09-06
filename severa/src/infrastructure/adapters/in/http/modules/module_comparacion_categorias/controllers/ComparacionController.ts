import express from 'express';
import { container } from '../../../config/container';

export const comparacionRouter = express.Router();

comparacionRouter.get('/acceso', async (req, res) => {
  const resultado = await container.compararPorTipoAccesoUseCase.ejecutar(req.analistaAutenticado!.id);
  res.json(resultado);
});

comparacionRouter.get('/tipo', async (req, res) => {
  const categoriaA = typeof req.query.categoriaA === 'string' ? req.query.categoriaA : 'N/A';
  const categoriaB = typeof req.query.categoriaB === 'string' ? req.query.categoriaB : 'N/A';
  const resultado = await container.compararPorTipoDeVulnerabilidadUseCase.ejecutar(categoriaA, categoriaB, req.analistaAutenticado!.id);
  res.json(resultado);
});

// Dropdown de "Comparación por software" (2026-07-20, bug real: comparar
// "Apache Log4j" vs "Nginx" a mano decía "sin datos" si el catálogo real
// tenía esos nombres escritos distinto) — lista real del catálogo del
// analista, para elegir en vez de escribir a ciegas. Montada ANTES de
// /software/:algo no aplica acá (no hay params en esta ruta), pero se monta
// antes de /software de todos modos por legibilidad (mismo criterio usado
// en NotificacionController.ts).
comparacionRouter.get('/software-disponible', async (req, res) => {
  const disponibles = await container.listarSoftwareDisponibleUseCase.ejecutar(req.analistaAutenticado!.id);
  res.json(disponibles);
});

comparacionRouter.get('/software', async (req, res) => {
  const categoriaA = typeof req.query.categoriaA === 'string' ? req.query.categoriaA : 'Apache Log4j';
  const categoriaB = typeof req.query.categoriaB === 'string' ? req.query.categoriaB : 'Nginx';
  const resultado = await container.compararPorSoftwareUseCase.ejecutar(categoriaA, categoriaB, req.analistaAutenticado!.id);
  res.json(resultado);
});
