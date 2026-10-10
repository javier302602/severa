import express from 'express';
import { container } from '../../../../../../config/container';
import { TransicionDeEstadoInvalidaError } from '../../../../../../../domain/errors/TransicionDeEstadoInvalidaError';
import {
  PLAZOS_RECOMENDADOS_EN_DIAS,
  PlazosPersonalizados,
  estimarPlazoRecomendado,
  evaluarRelacionPlazoReal
} from '../../../../../../../domain/services/classification/MotorDePriorizacion';

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
  // nivel ("carga por etapas", 2026-07-19): opcional — el frontend pide un
  // nivel de riesgo por vez en vez de todo el catálogo de una sola llamada.
  // RF-28 / RF-69: se acepta como `nivel` y, como antes, como `severidad`
  // (también con los nombres viejos: Crítica, Alta, Media, Baja). Sin el
  // parámetro, el ranking es completo.
  const nivelCrudo = req.query.nivel ?? req.query.severidad;
  const nivel = typeof nivelCrudo === 'string' ? nivelCrudo : undefined;

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
  const { escala, entradas } = await container.generarRankingUrgenciaUseCase.ejecutar(req.analistaAutenticado!.id, undefined, nivel, {
    plazosPersonalizados,
    pesoCriterio,
    pesoUrgencia
  });
  // RF-28 / RF-69: el nivel y el plazo de cada entrada salen de la escala
  // vigente del analista (la pantalla la nombra con el rótulo de escala).
  res.json(
    entradas.map((entrada) => ({
      posicion: entrada.posicion,
      cve: entrada.vulnerabilidad.cve.valor,
      cvssScore: entrada.vulnerabilidad.cvssScore.valor,
      nivelDeRiesgo: entrada.nivelDeRiesgo,
      // RF-71: el plazo recomendado para su nivel.
      plazoRecomendado: estimarPlazoRecomendado(entrada.nivelDeRiesgo, plazosPersonalizados),
      diasParaParche: entrada.vulnerabilidad.diasParaParche ?? null,
      estado: entrada.vulnerabilidad.estadoRemediacion.valor,
      // RF-72: relación entre el plazo recomendado y el tiempo real de
      // atención — "no aplicable" cuando la vulnerabilidad no registra
      // diasParaParche, en vez de forzar un cálculo con un valor inventado.
      relacionPlazoReal: evaluarRelacionPlazoReal(entrada.vulnerabilidad, escala.escala, plazosPersonalizados)
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
