import { CvssScore } from '../value-objects/CvssScore';
import { clasificar } from './ClasificadorDeRiesgo';
import { ComparacionGrupos } from './ComparadorDeCategorias';
import { EntradaRanking, estimarPlazoRecomendado } from './MotorDePriorizacion';

// RF-81: genera texto, no un cálculo numérico puro, pero se deja en el
// dominio (no en application/) porque es una función pura sin dependencias
// de infraestructura: recibe valores estadísticos ya calculados y devuelve
// strings, igual que GraficosEstadisticos recibe scores y devuelve datos de
// presentación (bins, etiquetas). No sabe nada de PDF/Word/HTTP — eso es
// responsabilidad del adaptador de salida en infrastructure/.

export interface ResumenEstadisticoCvss {
  media: number;
  mediana: number;
  coeficienteVariacion: number;
}

export function generarInterpretacion(
  totalVulnerabilidades: number,
  resumen: ResumenEstadisticoCvss,
  comparacionAccesoRemotoLocal: ComparacionGrupos,
  rankingUrgencia: EntradaRanking[]
): string[] {
  return [
    interpretarSeveridadPromedio(totalVulnerabilidades, resumen),
    interpretarDispersion(resumen.coeficienteVariacion),
    interpretarComparacionAcceso(comparacionAccesoRemotoLocal),
    interpretarRanking(rankingUrgencia)
  ];
}

export function interpretarSeveridadPromedio(totalVulnerabilidades: number, resumen: ResumenEstadisticoCvss): string {
  const nivelPromedio = clasificar(new CvssScore(resumen.media)).valor;
  return `La severidad promedio (CVSS) de las ${totalVulnerabilidades} vulnerabilidades analizadas es de ${resumen.media.toFixed(2)}, ` +
    `lo cual corresponde a un nivel de riesgo ${nivelPromedio}. La mediana es de ${resumen.mediana.toFixed(2)}.`;
}

// Convención estadística estándar para clasificar el coeficiente de
// variación (no es un número de negocio inventado): <15% dispersión baja,
// 15-30% moderada, >30% alta.
export function interpretarDispersion(coeficienteVariacion: number): string {
  if (coeficienteVariacion < 15) {
    return `El coeficiente de variación es de ${coeficienteVariacion.toFixed(2)}%, lo que indica baja dispersión: la severidad de las vulnerabilidades es relativamente homogénea.`;
  }
  if (coeficienteVariacion <= 30) {
    return `El coeficiente de variación es de ${coeficienteVariacion.toFixed(2)}%, lo que indica dispersión moderada en la severidad de las vulnerabilidades.`;
  }
  return `El coeficiente de variación es de ${coeficienteVariacion.toFixed(2)}%, lo que indica alta dispersión: la severidad de las vulnerabilidades es muy heterogénea.`;
}

export function interpretarComparacionAcceso(comparacion: ComparacionGrupos): string {
  const diferencia = Math.abs(comparacion.diferenciaMedias);
  if (diferencia < 0.05) {
    return `La severidad promedio entre vulnerabilidades de acceso remoto (${comparacion.mediaA.toFixed(2)}) y local (${comparacion.mediaB.toFixed(2)}) es prácticamente igual.`;
  }

  const esRemoto = comparacion.diferenciaMedias > 0;
  const masGrave = esRemoto ? 'remoto' : 'local';
  const masGravePlural = esRemoto ? 'remotos' : 'locales';
  return `Las vulnerabilidades de acceso ${masGrave} presentan, en promedio, una severidad ${diferencia.toFixed(2)} puntos mayor ` +
    `(remoto: ${comparacion.mediaA.toFixed(2)}, local: ${comparacion.mediaB.toFixed(2)}), lo que sugiere priorizar la remediación de accesos ${masGravePlural}.`;
}

export function interpretarRanking(ranking: EntradaRanking[]): string {
  const criticas = ranking.filter((entrada) => entrada.nivelDeRiesgo === 'Crítico').length;
  const plazoCritico = estimarPlazoRecomendado('Crítico');

  if (criticas === 0) {
    return 'No se identificaron vulnerabilidades de riesgo Crítico en el conjunto analizado.';
  }

  return `Se identificaron ${criticas} vulnerabilidad(es) de riesgo Crítico, que según el plazo recomendado deben remediarse en un máximo de ${plazoCritico} días.`;
}
