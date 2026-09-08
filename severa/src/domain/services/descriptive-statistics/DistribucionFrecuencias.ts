import { ValorEstadisticoError } from '../../errors/ValorEstadisticoError';
import { NumeroDeIntervalosInvalidoError } from '../../errors/NumeroDeIntervalosInvalidoError';

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

// RF-39: rango razonable para un número de intervalos elegido a mano por el
// analista. 2 es el mínimo con sentido (menos que eso no es una
// distribución agrupada); 30 es un techo generoso — el cálculo automático
// (Sturges, ver AnalisisUnivariadoGenerico.ts) ya se acota a 10, así que 30
// deja margen real para quien deliberadamente quiere más detalle sin llegar
// a una tabla inutilizable.
export const NUMERO_MINIMO_DE_INTERVALOS = 2;
export const NUMERO_MAXIMO_DE_INTERVALOS = 30;

export function validarNumeroDeIntervalos(numeroDeIntervalos: number): void {
  if (
    !Number.isInteger(numeroDeIntervalos) ||
    numeroDeIntervalos < NUMERO_MINIMO_DE_INTERVALOS ||
    numeroDeIntervalos > NUMERO_MAXIMO_DE_INTERVALOS
  ) {
    throw new NumeroDeIntervalosInvalidoError(
      `El número de intervalos debe ser un entero entre ${NUMERO_MINIMO_DE_INTERVALOS} y ${NUMERO_MAXIMO_DE_INTERVALOS}`
    );
  }
}

// Sin este redondeo, dividir un rango arbitrario en N partes iguales deja
// restos de coma flotante en los límites (ej. 36.400000000000006 en vez de
// 36.4) — bug real confirmado generando el informe de Fase 5. Los intervalos
// con límites fijos (INTERVALOS_POR_DEFECTO) nunca lo sufren porque sus
// límites ya son enteros exactos; acá sí hace falta porque el ancho de cada
// intervalo se calcula en el momento a partir de min/max.
function redondear(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

// RF-34/RF-39: reparto equiespaciado genérico, compartido por ambos
// pipelines — el genérico (Fase 3, AnalisisUnivariadoGenerico.ts) lo usa
// tanto para el cálculo automático (Sturges) como para un número de
// intervalos manual; el de ciberseguridad (GenerarDistribucionFrecuencias.ts)
// lo usa para el override manual sobre el rango fijo 0-10 de CVSS. Nota: con
// minimo=0, maximo=10 y cantidadIntervalos=5, esta función reproduce
// exactamente INTERVALOS_POR_DEFECTO (0-2, 2-4, 4-6, 6-8, 8-10) — por eso las
// 5 bandas oficiales de CVSS son, matemáticamente, el caso por defecto de
// esta misma función, no un caso aparte.
export function generarIntervalosEquiespaciados(
  minimo: number,
  maximo: number,
  cantidadIntervalos: number
): Array<{ inferior: number; superior: number }> {
  if (minimo === maximo) {
    return [{ inferior: minimo, superior: maximo }];
  }

  const ancho = (maximo - minimo) / cantidadIntervalos;

  return Array.from({ length: cantidadIntervalos }, (_, indice) => ({
    inferior: redondear(minimo + indice * ancho),
    superior: indice === cantidadIntervalos - 1 ? maximo : redondear(minimo + (indice + 1) * ancho)
  }));
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
