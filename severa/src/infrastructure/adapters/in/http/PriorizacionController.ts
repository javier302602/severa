import express from 'express';
import { container } from '../../../config/container';
import { TransicionDeEstadoInvalidaError } from '../../../../domain/errors/TransicionDeEstadoInvalidaError';

// Rutas con prefijos distintos (/priorizacion y /vulnerabilidades), montadas
// sin prefijo adicional en server.ts.
export const priorizacionRouter = express.Router();

priorizacionRouter.get('/priorizacion/ranking', async (req, res) => {
  // severidad (2026-07-19, "carga por etapas"): opcional — el frontend pide
  // una severidad por vez (Crítica/Alta/Media/Baja) en vez de todo el
  // catálogo de una sola llamada. Sin el query param, se comporta como
  // siempre (ranking completo) — no rompe a nadie que ya lo use así.
  const severidad = typeof req.query.severidad === 'string' ? req.query.severidad : undefined;

  // RF-76: se pasa el analista autenticado para que, si esta llamada dispara
  // una alerta de plazo excedido, quede asociada a su centro de
  // notificaciones y no solo a consola.
  const ranking = await container.generarRankingUrgenciaUseCase.ejecutar(req.analistaAutenticado!.id, undefined, severidad);
  res.json(
    ranking.map((entrada) => ({
      posicion: entrada.posicion,
      cve: entrada.vulnerabilidad.cve.valor,
      cvssScore: entrada.vulnerabilidad.cvssScore.valor,
      nivelDeRiesgo: entrada.nivelDeRiesgo,
      diasParaParche: entrada.vulnerabilidad.diasParaParche ?? null,
      estado: entrada.vulnerabilidad.estadoRemediacion.valor
    }))
  );
});

priorizacionRouter.patch('/vulnerabilidades/:cve/estado', async (req, res) => {
  const { estado } = req.body;

  if (estado !== 'EnProceso' && estado !== 'Remediada') {
    res.status(400).json({ error: `Estado no soportado: "${estado}". Valores permitidos: EnProceso, Remediada.` });
    return;
  }

  try {
    const analistaId = req.analistaAutenticado!.id;
    const vulnerabilidad = estado === 'EnProceso'
      ? await container.marcarEnProcesoDeRemediacionUseCase.ejecutar(req.params.cve, analistaId)
      : await container.marcarComoRemediadaUseCase.ejecutar(req.params.cve, analistaId);

    if (!vulnerabilidad) {
      res.status(404).json({ error: 'Vulnerabilidad no encontrada' });
      return;
    }

    res.json({
      cve: vulnerabilidad.cve.valor,
      estado: vulnerabilidad.estadoRemediacion.valor,
      fechaRemediacion: vulnerabilidad.fechaRemediacion ?? null
    });
  } catch (error) {
    if (error instanceof TransicionDeEstadoInvalidaError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});
