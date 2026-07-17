import { Vulnerabilidad } from '../entities/Vulnerabilidad';
import { clasificar } from './ClasificadorDeRiesgo';
import { NivelDeRiesgo } from '../value-objects/NivelDeRiesgo';

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

// RF-71: plazos recomendados por nivel de riesgo, en días. El SDS (RF-71) da
// como ejemplo "7, 30, 90 días" para Crítico/Alto/Moderado sin fijarlos como
// regla formal; el valor de Bajo (180) no aparece en el SDS. Los cuatro
// fueron propuestos y confirmados explícitamente por el product owner para
// Sprint 09 — no están inventados sobre la marcha.
const PLAZOS_RECOMENDADOS_EN_DIAS: Record<NivelDeRiesgo, number> = {
  Crítico: 7,
  Alto: 30,
  Moderado: 90,
  Bajo: 180
};

/**
 * RF-70/RF-73: genera el ranking de urgencia combinando CVSS Score y Días
 * para Parche mediante un orden lexicográfico de tres claves (sin coeficientes
 * de ponderación inventados):
 *
 *   1) Nivel de riesgo (Crítico > Alto > Moderado > Bajo). La severidad manda
 *      siempre primero: una vulnerabilidad Crítica nunca queda por debajo de
 *      una Alta, sin importar cuántos días lleve abierta.
 *   2) CVSS Score exacto, descendente. Desempata dentro del mismo nivel de
 *      riesgo (p. ej. dos "Críticas" con 10.0 y 9.0 no quedan en el mismo
 *      lugar).
 *   3) Días para parche, descendente. A igualdad de nivel y CVSS, la que
 *      lleva más tiempo sin parchear sube en el ranking. Las vulnerabilidades
 *      sin días registrados (undefined) se ubican al final de su grupo.
 */
export function generarRanking(vulnerabilidades: Vulnerabilidad[]): EntradaRanking[] {
  const ordenado = [...vulnerabilidades].sort((a, b) => {
    const nivelA = clasificar(a.cvssScore).valor;
    const nivelB = clasificar(b.cvssScore).valor;

    if (nivelA !== nivelB) {
      return PESO_NIVEL[nivelB] - PESO_NIVEL[nivelA];
    }
    if (a.cvssScore.valor !== b.cvssScore.valor) {
      return b.cvssScore.valor - a.cvssScore.valor;
    }

    const diasA = a.diasParaParche ?? -1;
    const diasB = b.diasParaParche ?? -1;
    return diasB - diasA;
  });

  return ordenado.map((vulnerabilidad, indice) => ({
    posicion: indice + 1,
    vulnerabilidad,
    nivelDeRiesgo: clasificar(vulnerabilidad.cvssScore).valor
  }));
}

export function estimarPlazoRecomendado(nivelDeRiesgo: NivelDeRiesgo): number {
  return PLAZOS_RECOMENDADOS_EN_DIAS[nivelDeRiesgo];
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
export function estaPlazoExcedido(vulnerabilidad: Vulnerabilidad, fechaActual: Date = new Date()): boolean {
  if (vulnerabilidad.estadoRemediacion.valor === 'Remediada') {
    return false;
  }

  const nivelDeRiesgo = clasificar(vulnerabilidad.cvssScore).valor;
  const plazo = estimarPlazoRecomendado(nivelDeRiesgo);
  const milisegundosPorDia = 1000 * 60 * 60 * 24;
  const diasTranscurridos = Math.floor((fechaActual.getTime() - vulnerabilidad.fechaCarga.getTime()) / milisegundosPorDia);

  return diasTranscurridos > plazo;
}
