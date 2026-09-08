import express from 'express';
import { container } from '../../../../../../config/container';
import { TransicionDeEstadoInvalidaError } from '../../../../../../../domain/errors/TransicionDeEstadoInvalidaError';
import { PLAZOS_RECOMENDADOS_EN_DIAS, PlazosPersonalizados, evaluarRelacionPlazoReal } from '../../../../../../../domain/services/classification/MotorDePriorizacion';

// Rutas con prefijos distintos (/priorizacion y /vulnerabilidades), montadas
// sin prefijo adicional en server.ts.
export const priorizacionRouter = express.Router();

const NIVELES_DE_RIESGO = Object.keys(PLAZOS_RECOMENDADOS_EN_DIAS) as Array<keyof PlazosPersonalizados>;
const QUERY_PARAM_POR_NIVEL: Record<keyof PlazosPersonalizados, string> = {
  Crítico: 'plazoCritico',
  Alto: 'plazoAlto',
  Moderado: 'plazoModerado',
  Bajo: 'plazoBajo'
};

// RF-71: parsea los 4 query params opcionales de plazo — si ninguno vino,
// devuelve undefined (generarRankingUrgenciaUseCase usa el default). Si
// alguno vino pero no es un número positivo finito, se señala como inválido
// para que el handler responda 400 en vez de generar un ranking con un
// plazo sin sentido (NaN, negativo).
function parsearPlazosPersonalizados(query: express.Request['query']): { plazos?: PlazosPersonalizados; error?: string } {
  const provistos = NIVELES_DE_RIESGO.filter((nivel) => query[QUERY_PARAM_POR_NIVEL[nivel]] !== undefined);
  if (provistos.length === 0) {
    return {};
  }

  const plazos = { ...PLAZOS_RECOMENDADOS_EN_DIAS };
  for (const nivel of provistos) {
    const crudo = query[QUERY_PARAM_POR_NIVEL[nivel]];
    const numero = Number(crudo);
    if (!Number.isFinite(numero) || numero <= 0) {
      return { error: `"${QUERY_PARAM_POR_NIVEL[nivel]}" debe ser un número mayor a 0` };
    }
    plazos[nivel] = numero;
  }
  return { plazos };
}

// RF-73: pesos configurables, cada uno independiente del otro — si viene uno
// solo, el otro se queda en su default (no se exige mandar ambos).
function parsearPeso(valor: unknown, nombreParametro: string): { peso?: number; error?: string } {
  if (valor === undefined) {
    return {};
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    return { error: `"${nombreParametro}" debe ser un número mayor o igual a 0` };
  }
  return { peso: numero };
}

priorizacionRouter.get('/priorizacion/ranking', async (req, res) => {
  // severidad (2026-07-19, "carga por etapas"): opcional — el frontend pide
  // una severidad por vez (Crítica/Alta/Media/Baja) en vez de todo el
  // catálogo de una sola llamada. Sin el query param, se comporta como
  // siempre (ranking completo) — no rompe a nadie que ya lo use así.
  const severidad = typeof req.query.severidad === 'string' ? req.query.severidad : undefined;

  const { plazos: plazosPersonalizados, error: errorPlazos } = parsearPlazosPersonalizados(req.query);
  if (errorPlazos) {
    res.status(400).json({ error: errorPlazos });
    return;
  }
  const { peso: pesoCriterio, error: errorPesoCriterio } = parsearPeso(req.query.pesoCriterio, 'pesoCriterio');
  if (errorPesoCriterio) {
    res.status(400).json({ error: errorPesoCriterio });
    return;
  }
  const { peso: pesoUrgencia, error: errorPesoUrgencia } = parsearPeso(req.query.pesoUrgencia, 'pesoUrgencia');
  if (errorPesoUrgencia) {
    res.status(400).json({ error: errorPesoUrgencia });
    return;
  }

  // RF-76: se pasa el analista autenticado para que, si esta llamada dispara
  // una alerta de plazo excedido, quede asociada a su centro de
  // notificaciones y no solo a consola.
  const ranking = await container.generarRankingUrgenciaUseCase.ejecutar(req.analistaAutenticado!.id, undefined, severidad, {
    plazosPersonalizados,
    pesoCriterio,
    pesoUrgencia
  });
  res.json(
    ranking.map((entrada) => ({
      posicion: entrada.posicion,
      cve: entrada.vulnerabilidad.cve.valor,
      cvssScore: entrada.vulnerabilidad.cvssScore.valor,
      nivelDeRiesgo: entrada.nivelDeRiesgo,
      diasParaParche: entrada.vulnerabilidad.diasParaParche ?? null,
      estado: entrada.vulnerabilidad.estadoRemediacion.valor,
      // RF-72: relación entre el plazo recomendado y el tiempo real de
      // atención — "no aplicable" cuando la vulnerabilidad no registra
      // diasParaParche, en vez de forzar un cálculo con un valor inventado.
      relacionPlazoReal: evaluarRelacionPlazoReal(entrada.vulnerabilidad, plazosPersonalizados)
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
