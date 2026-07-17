import { ValorEstadisticoError } from '../errors/ValorEstadisticoError';

export type TablaFrecuencia = {
  intervalo: string;
  limiteInferior: number;
  limiteSuperior: number;
  marcaDeClase: number;
  frecuenciaAbsoluta: number;
  frecuenciaRelativa: number;
  frecuenciaRelativaPorcentaje: number;
  frecuenciaAcumulada: number;
  frecuenciaRelativaAcumulada: number;
};

const INTERVALOS_POR_DEFECTO = [
  { inferior: 0, superior: 2 },
  { inferior: 2, superior: 4 },
  { inferior: 4, superior: 6 },
  { inferior: 6, superior: 8 },
  { inferior: 8, superior: 10 }
];

// Fase 0: mismo desacople de EstadisticaDescriptiva.ts — el rango 0-10 era
// redundante con CvssScore.ts (que ya lo garantiza al construirse) y no
// generaliza a otras columnas (ver comentario detallado en
// EstadisticaDescriptiva.ts).
function validarScores(scores: number[], etiqueta = 'CVSS Score'): void {
  if (scores.length === 0) {
    throw new ValorEstadisticoError(`La lista de ${etiqueta} no puede estar vacía`);
  }
  if (scores.some((score) => !Number.isFinite(score))) {
    throw new ValorEstadisticoError(`Todos los ${etiqueta} deben ser números finitos`);
  }
}

function calcularMarcaDeClase(inferior: number, superior: number): number {
  return (inferior + superior) / 2;
}

export function generarTablaAgrupada(
  scores: number[],
  intervalos = INTERVALOS_POR_DEFECTO,
  etiqueta?: string
): TablaFrecuencia[] {
  validarScores(scores, etiqueta);
  const total = scores.length;

  const maxSuperior = Math.max(...intervalos.map((intervalo) => intervalo.superior));

  const tabla = intervalos.map((intervalo) => {
    const esUltimoIntervalo = intervalo.superior === maxSuperior;
    const frecuencia = scores.filter(
      (score) => score >= intervalo.inferior
        && (esUltimoIntervalo ? score <= intervalo.superior : score < intervalo.superior)
    ).length;

    return {
      intervalo: `[${intervalo.inferior}-${intervalo.superior})`,
      limiteInferior: intervalo.inferior,
      limiteSuperior: intervalo.superior,
      marcaDeClase: calcularMarcaDeClase(intervalo.inferior, intervalo.superior),
      frecuenciaAbsoluta: frecuencia,
      frecuenciaRelativa: total === 0 ? 0 : frecuencia / total,
      frecuenciaRelativaPorcentaje: total === 0 ? 0 : (frecuencia / total) * 100,
      frecuenciaAcumulada: 0,
      frecuenciaRelativaAcumulada: 0
    };
  });

  let acumulada = 0;
  let acumuladaRelativa = 0;

  return tabla.map((fila) => {
    acumulada += fila.frecuenciaAbsoluta;
    acumuladaRelativa += fila.frecuenciaRelativa;

    return {
      ...fila,
      frecuenciaAcumulada: acumulada,
      frecuenciaRelativaAcumulada: Number(acumuladaRelativa.toFixed(6))
    };
  });
}

export function generarTablaSinAgrupar(scores: number[], etiqueta?: string): Array<{ valor: number; frecuencia: number }> {
  validarScores(scores, etiqueta);
  const frecuencias = new Map<number, number>();

  for (const score of scores) {
    frecuencias.set(score, (frecuencias.get(score) ?? 0) + 1);
  }

  return [...frecuencias.entries()]
    .map(([valor, frecuencia]) => ({ valor, frecuencia }))
    .sort((a, b) => a.valor - b.valor);
}
