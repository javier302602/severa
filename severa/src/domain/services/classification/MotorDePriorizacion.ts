import { Vulnerabilidad } from '../../entities/Vulnerabilidad';
import { clasificar } from './ClasificadorDeRiesgo';
import { NivelDeRiesgo } from '../../shared/value-objects/NivelDeRiesgo';
import { calcularMedia, calcularDesviacionEstandarMuestral } from '../descriptive-statistics/EstadisticaDescriptiva';

export interface EntradaRanking {
  posicion: number;
  vulnerabilidad: Vulnerabilidad;
  nivelDeRiesgo: NivelDeRiesgo;
}

const PESO_NIVEL: Record<NivelDeRiesgo, number> = {
  Crítico: 3,
  Alto: 2,
  Moderado: 1,
  Bajo: 0
};

export type PlazosPersonalizados = Record<NivelDeRiesgo, number>;

// RF-71: plazos recomendados por nivel de riesgo, en días. El SDS (RF-71) da
// como ejemplo "7, 30, 90 días" para Crítico/Alto/Moderado sin fijarlos como
// regla formal; el valor de Bajo (180) no aparece en el SDS. Los cuatro
// fueron propuestos y confirmados explícitamente por el product owner para
// Sprint 09 — quedan como default, pero desde la auditoría M-09 (frente B)
// son overrideables por llamada vía `plazosPersonalizados` (ver
// estimarPlazoRecomendado/estaPlazoExcedido), no una constante inamovible.
export const PLAZOS_RECOMENDADOS_EN_DIAS: PlazosPersonalizados = {
  Crítico: 7,
  Alto: 30,
  Moderado: 90,
  Bajo: 180
};

export interface OpcionesDeRanking {
  // RF-73: pesos de la combinación ponderada criterio+urgencia. Default
  // 0.7/0.3 — el criterio (severidad) pesa más que la urgencia (días de
  // espera) a propósito, para que el ranking siga pareciéndose al de antes
  // de RF-73 en el caso común (ver auditoría M-09, verificación a mano de
  // MotorDePriorizacion.test.ts). No exigen sumar 1: son pesos relativos,
  // no una distribución de probabilidad.
  pesoCriterio?: number;
  pesoUrgencia?: number;
}

const PESO_CRITERIO_POR_DEFECTO = 0.7;
const PESO_URGENCIA_POR_DEFECTO = 0.3;

// z-score de una lista de valores (cuántas desviaciones estándar por encima/
// debajo de la media es cada uno). Reutiliza calcularMedia/
// calcularDesviacionEstandarMuestral (M-06/M-07/M-08) en vez de reimplementar
// media/varianza acá — es RF-73 tal cual lo pide el SDS ("reutilizando
// calcularDesviacionEstandarMuestral"), no una fórmula inventada.
//
// Con menos de 2 valores calcularDesviacionEstandarMuestral lanza
// ValorEstadisticoError (no hay dispersión que medir con un solo dato) — acá
// se devuelve 0 para todos en vez de propagar el error: un bucket de nivel
// de riesgo con un solo elemento no necesita desempate ponderado. Con
// desviación 0 (todos los valores iguales) tampoco hay nada que normalizar,
// mismo resultado neutro.
function zScoresPorBucket(valores: number[]): number[] {
  if (valores.length < 2) {
    return valores.map(() => 0);
  }
  const media = calcularMedia(valores, 'valor de ranking');
  const desviacion = calcularDesviacionEstandarMuestral(valores, 'valor de ranking');
  if (desviacion === 0) {
    return valores.map(() => 0);
  }
  return valores.map((valor) => (valor - media) / desviacion);
}

/**
 * RF-70/RF-73: genera el ranking de urgencia.
 *
 *   1) Nivel de riesgo (Crítico > Alto > Moderado > Bajo) sigue siendo la
 *      clave PRIMARIA, sin excepción: una vulnerabilidad Crítica nunca queda
 *      por debajo de una Alta, sin importar el puntaje ponderado. Esto es a
 *      propósito (RF-70) y no se toca en RF-73 — ver auditoría M-09.
 *   2) Dentro de cada nivel de riesgo, RF-73 pondera de verdad: puntaje =
 *      pesoCriterio * zScore(cvssScore) + pesoUrgencia * zScore(díasParaParche),
 *      con los z-scores calculados DENTRO del propio bucket (cuánto se
 *      desvía cada ítem de sus pares del mismo nivel de riesgo, no de todo
 *      el catálogo). Antes de RF-73 esto era un sort lexicográfico fijo sin
 *      pesos ni dispersión — ese comportamiento queda reemplazado.
 *   3) Empate exacto en el puntaje ponderado (mismo CVSS y mismos días, o
 *      bucket de un solo elemento): desempate final estable por CVSS exacto
 *      descendente y luego días descendente, igual que el criterio anterior
 *      a RF-73. Las vulnerabilidades sin días registrados (undefined) se
 *      ubican al final de su grupo en ese desempate final.
 */
export function generarRanking(vulnerabilidades: Vulnerabilidad[], opciones: OpcionesDeRanking = {}): EntradaRanking[] {
  const pesoCriterio = opciones.pesoCriterio ?? PESO_CRITERIO_POR_DEFECTO;
  const pesoUrgencia = opciones.pesoUrgencia ?? PESO_URGENCIA_POR_DEFECTO;

  const entradas: Array<{ vulnerabilidad: Vulnerabilidad; nivelDeRiesgo: NivelDeRiesgo; puntaje: number }> = vulnerabilidades.map(
    (vulnerabilidad) => ({
      vulnerabilidad,
      nivelDeRiesgo: clasificar(vulnerabilidad.cvssScore).valor,
      puntaje: 0
    })
  );

  for (const nivel of Object.keys(PESO_NIVEL) as NivelDeRiesgo[]) {
    const delBucket = entradas.filter((entrada) => entrada.nivelDeRiesgo === nivel);
    if (delBucket.length === 0) {
      continue;
    }

    const cvssScores = delBucket.map((entrada) => entrada.vulnerabilidad.cvssScore.valor);
    const dias = delBucket.map((entrada) => entrada.vulnerabilidad.diasParaParche ?? 0);
    const zCriterio = zScoresPorBucket(cvssScores);
    const zUrgencia = zScoresPorBucket(dias);

    delBucket.forEach((entrada, indice) => {
      entrada.puntaje = pesoCriterio * zCriterio[indice] + pesoUrgencia * zUrgencia[indice];
    });
  }

  const ordenado = [...entradas].sort((a, b) => {
    if (a.nivelDeRiesgo !== b.nivelDeRiesgo) {
      return PESO_NIVEL[b.nivelDeRiesgo] - PESO_NIVEL[a.nivelDeRiesgo];
    }
    if (a.puntaje !== b.puntaje) {
      return b.puntaje - a.puntaje;
    }
    if (a.vulnerabilidad.cvssScore.valor !== b.vulnerabilidad.cvssScore.valor) {
      return b.vulnerabilidad.cvssScore.valor - a.vulnerabilidad.cvssScore.valor;
    }
    const diasA = a.vulnerabilidad.diasParaParche ?? -1;
    const diasB = b.vulnerabilidad.diasParaParche ?? -1;
    return diasB - diasA;
  });

  return ordenado.map((entrada, indice) => ({
    posicion: indice + 1,
    vulnerabilidad: entrada.vulnerabilidad,
    nivelDeRiesgo: entrada.nivelDeRiesgo
  }));
}

export function estimarPlazoRecomendado(nivelDeRiesgo: NivelDeRiesgo, plazosPersonalizados?: PlazosPersonalizados): number {
  return (plazosPersonalizados ?? PLAZOS_RECOMENDADOS_EN_DIAS)[nivelDeRiesgo];
}

/**
 * RF-76: una vulnerabilidad excede su plazo cuando, sin estar remediada, han
 * transcurrido más días desde su fecha de carga que el plazo recomendado
 * para su nivel de riesgo.
 *
 * LIMITACIÓN CONOCIDA: el "reloj" del plazo arranca en fechaCarga (cuándo
 * SEVERA importó el registro), NO en la fecha real de divulgación pública de
 * la vulnerabilidad (NVD publishedDate). El dataset que consume SEVERA no
 * incluye esa fecha — solo trae CVSS Score y el histórico "Días para Parche"
 * (que mide otra cosa: cuánto tardó en remediarse, no cuándo se divulgó).
 * Por lo tanto, "plazo excedido" mide el tiempo que SEVERA lleva rastreando
 * la vulnerabilidad sin remediar, no el tiempo real de exposición desde su
 * divulgación. Dos CVE divulgados en fechas distintas años antes de cargarse
 * el mismo día a SEVERA arrancan el reloj exactamente igual. Si en el futuro
 * el dataset incorpora una fecha de divulgación real (p. ej. vía
 * sincronización con la API NVD 2.0, ver CC-05 en el SDS), esta función
 * debería recibir esa fecha en vez de fechaCarga.
 */
export function estaPlazoExcedido(
  vulnerabilidad: Vulnerabilidad,
  fechaActual: Date = new Date(),
  plazosPersonalizados?: PlazosPersonalizados
): boolean {
  if (vulnerabilidad.estadoRemediacion.valor === 'Remediada') {
    return false;
  }

  const nivelDeRiesgo = clasificar(vulnerabilidad.cvssScore).valor;
  const plazo = estimarPlazoRecomendado(nivelDeRiesgo, plazosPersonalizados);
  const milisegundosPorDia = 1000 * 60 * 60 * 24;
  const diasTranscurridos = Math.floor((fechaActual.getTime() - vulnerabilidad.fechaCarga.getTime()) / milisegundosPorDia);

  return diasTranscurridos > plazo;
}

/**
 * RF-100 (M-13, retoma): hermana de estaPlazoExcedido, mismo "reloj" (fechaCarga
 * + plazo recomendado por nivel de riesgo, misma LIMITACIÓN CONOCIDA
 * documentada arriba) pero para el lado "antes" en vez de "después" — avisa
 * cuando faltan `horasDeAntelacion` horas o menos para el vencimiento, no
 * cuando ya se excedió. No acepta un plazo personalizado persistido por
 * analista porque esa persistencia no existe (plazosPersonalizados es
 * puramente query-param, ver PriorizacionController.ts — confirmado en la
 * auditoría de retoma M-13); el parámetro queda listo para recibirlo el día
 * que exista.
 */
export function estaPlazoProximoAVencer(
  vulnerabilidad: Vulnerabilidad,
  fechaActual: Date = new Date(),
  horasDeAntelacion = 48,
  plazosPersonalizados?: PlazosPersonalizados
): boolean {
  if (vulnerabilidad.estadoRemediacion.valor === 'Remediada') {
    return false;
  }

  const nivelDeRiesgo = clasificar(vulnerabilidad.cvssScore).valor;
  const plazoEnDias = estimarPlazoRecomendado(nivelDeRiesgo, plazosPersonalizados);
  const msPorHora = 1000 * 60 * 60;
  const vencimiento = vulnerabilidad.fechaCarga.getTime() + plazoEnDias * 24 * msPorHora;
  const msRestantes = vencimiento - fechaActual.getTime();

  return msRestantes > 0 && msRestantes <= horasDeAntelacion * msPorHora;
}

export type RelacionPlazoReal =
  | { aplicable: true; plazoRecomendado: number; diasReales: number; diferenciaDias: number; cumplioPlazo: boolean }
  | { aplicable: false; motivo: string };

/**
 * RF-72: relación entre el plazo recomendado (RF-71) y el tiempo real de
 * atención. `Vulnerabilidad.diasParaParche` es la variable temporal de
 * atención real (dato histórico del propio dataset — "cuánto tardó en
 * remediarse" — ver la limitación documentada en estaPlazoExcedido, que
 * distingue esto de fechaCarga). Cuando no está registrada, se marca
 * explícitamente "no aplicable" en vez de forzar el cálculo con un valor
 * inventado (0, o el plazo recomendado mismo).
 */
export function evaluarRelacionPlazoReal(vulnerabilidad: Vulnerabilidad, plazosPersonalizados?: PlazosPersonalizados): RelacionPlazoReal {
  if (vulnerabilidad.diasParaParche === undefined) {
    return { aplicable: false, motivo: 'La vulnerabilidad no registra la variable temporal de atención real (Días para Parche)' };
  }

  const nivelDeRiesgo = clasificar(vulnerabilidad.cvssScore).valor;
  const plazoRecomendado = estimarPlazoRecomendado(nivelDeRiesgo, plazosPersonalizados);
  const diasReales = vulnerabilidad.diasParaParche;

  return {
    aplicable: true,
    plazoRecomendado,
    diasReales,
    diferenciaDias: diasReales - plazoRecomendado,
    cumplioPlazo: diasReales <= plazoRecomendado
  };
}
