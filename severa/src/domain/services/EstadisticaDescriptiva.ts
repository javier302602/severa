import { ValorEstadisticoError } from '../errors/ValorEstadisticoError';

// Fase 0 (mejora de mapeo flexible / Análisis de Datos General): antes esta
// validación rechazaba cualquier valor fuera de 0.0-10.0, un rango que solo
// tiene sentido para CVSS Score. Esa restricción era redundante para CVSS
// real (CvssScore.ts YA garantiza 0-10 en el constructor, ver
// CvssFueraDeRangoError) y activamente rompía la reutilización de estas
// mismas fórmulas sobre cualquier otro número — bug real confirmado en vivo:
// GraficosEstadisticos.generarDatosHistogramaDiasParche llama a
// calcularMedia/calcularMediana sobre "Días para Parche" (que legítimamente
// supera 10, ej. 90 días), y el histograma de /graficos/histogramaDiasParche
// rompía con "Todos los CVSS Score deben ser números finitos entre 0.0 y
// 10.0" apenas el dataset tenía un solo caso con más de 10 días. Se
// mantienen las dos validaciones que sí son universales (lista no vacía,
// valores finitos) y se parametriza la etiqueta del mensaje para que siga
// diciendo "CVSS Score" en los ~30 call sites existentes (default sin
// cambios) pero pueda decir "Días para Parche" o cualquier columna genérica
// donde corresponda.
function validarValores(valores: number[], etiqueta = 'CVSS Score'): void {
  if (valores.length === 0) {
    throw new ValorEstadisticoError(`La lista de ${etiqueta} no puede estar vacía`);
  }
  if (valores.some((valor) => !Number.isFinite(valor))) {
    throw new ValorEstadisticoError(`Todos los ${etiqueta} deben ser números finitos`);
  }
}

function ordenados(scores: number[]): number[] {
  return [...scores].sort((a, b) => a - b);
}

export function calcularMedia(scores: number[], etiqueta?: string): number {
  validarValores(scores, etiqueta);
  const suma = scores.reduce((acum, valor) => acum + valor, 0);
  return suma / scores.length;
}

export function calcularMediana(scores: number[], etiqueta?: string): number {
  validarValores(scores, etiqueta);
  const lista = ordenados(scores);
  const mitad = Math.floor(lista.length / 2);

  if (lista.length % 2 === 0) {
    return (lista[mitad - 1] + lista[mitad]) / 2;
  }

  return lista[mitad];
}

export function calcularModa(scores: number[], etiqueta?: string): number[] {
  validarValores(scores, etiqueta);
  const frecuencia = new Map<number, number>();

  for (const score of scores) {
    frecuencia.set(score, (frecuencia.get(score) ?? 0) + 1);
  }

  let maxFrecuencia = 0;
  frecuencia.forEach((valor) => {
    if (valor > maxFrecuencia) {
      maxFrecuencia = valor;
    }
  });

  const modas = [...frecuencia.entries()]
    .filter(([, cantidad]) => cantidad === maxFrecuencia)
    .map(([valor]) => valor)
    .sort((a, b) => a - b);

  return modas;
}

export function calcularPercentil(scores: number[], porcentaje: number, etiqueta?: string): number {
  validarValores(scores, etiqueta);
  if (porcentaje < 0 || porcentaje > 100) {
    throw new ValorEstadisticoError('El porcentaje debe estar entre 0 y 100');
  }

  const lista = ordenados(scores);
  const posicion = (porcentaje / 100) * (lista.length - 1);
  const base = Math.floor(posicion);
  const resto = posicion - base;

  if (base + 1 >= lista.length) {
    return lista[base];
  }

  return lista[base] + resto * (lista[base + 1] - lista[base]);
}

export function calcularCuartiles(scores: number[], etiqueta?: string): { q1: number; q3: number } {
  validarValores(scores, etiqueta);
  return {
    q1: calcularPercentil(scores, 25, etiqueta),
    q3: calcularPercentil(scores, 75, etiqueta)
  };
}

export function calcularRango(scores: number[], etiqueta?: string): number {
  validarValores(scores, etiqueta);
  const lista = ordenados(scores);
  return lista[lista.length - 1] - lista[0];
}

export function calcularVarianzaMuestral(scores: number[], etiqueta?: string): number {
  validarValores(scores, etiqueta);
  if (scores.length < 2) {
    throw new ValorEstadisticoError('Se requieren al menos dos valores para calcular varianza');
  }

  const media = calcularMedia(scores, etiqueta);
  const sumaDiferencias = scores.reduce((acum, valor) => acum + (valor - media) ** 2, 0);
  return sumaDiferencias / (scores.length - 1);
}

export function calcularDesviacionEstandarMuestral(scores: number[], etiqueta?: string): number {
  return Math.sqrt(calcularVarianzaMuestral(scores, etiqueta));
}

export function calcularCoeficienteVariacion(scores: number[], etiqueta?: string): number {
  const media = calcularMedia(scores, etiqueta);
  if (media === 0) {
    throw new ValorEstadisticoError('La media no puede ser cero para calcular el coeficiente de variación');
  }

  const desviacion = calcularDesviacionEstandarMuestral(scores, etiqueta);
  return (desviacion / media) * 100;
}

export function calcularMediaGeometrica(scores: number[], etiqueta?: string): number {
  validarValores(scores, etiqueta);
  const positivos = scores.filter((score) => score > 0);
  if (positivos.length === 0) {
    throw new ValorEstadisticoError('Se requieren valores positivos para calcular la media geométrica');
  }

  const sumaLogaritmos = positivos.reduce((acum, valor) => acum + Math.log(valor), 0);
  return Math.exp(sumaLogaritmos / positivos.length);
}

export function calcularMediaArmonica(scores: number[], etiqueta?: string): number {
  validarValores(scores, etiqueta);
  const positivos = scores.filter((score) => score > 0);
  if (positivos.length === 0) {
    throw new ValorEstadisticoError('Se requieren valores positivos para calcular la media armónica');
  }

  const sumaReciprocos = positivos.reduce((acum, valor) => acum + 1 / valor, 0);
  return positivos.length / sumaReciprocos;
}

export interface ResumenCincoNumeros {
  minimo: number;
  q1: number;
  mediana: number;
  q3: number;
  maximo: number;
  media: number;
}

// Fase 1 (informe): el boxplot (Gráfico 4/6 del informe) necesita los 5
// valores que lo definen más la media (para marcar el punto "x" sobre la
// caja, igual que el Gráfico 6 del .qmd de referencia) — se agrupan acá en
// vez de que cada llamador repita min/max/cuartiles/media por separado.
export function calcularResumenCincoNumeros(scores: number[], etiqueta?: string): ResumenCincoNumeros {
  const lista = [...scores].sort((a, b) => a - b);
  const { q1, q3 } = calcularCuartiles(scores, etiqueta);

  return {
    minimo: lista[0],
    q1,
    mediana: calcularMediana(scores, etiqueta),
    q3,
    maximo: lista[lista.length - 1],
    media: calcularMedia(scores, etiqueta)
  };
}
