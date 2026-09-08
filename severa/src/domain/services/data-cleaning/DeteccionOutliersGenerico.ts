import { esVacio, esNumerico, inferirTipoColumna } from '../variable-detection/DetectorDeTipoDeColumna';
import { calcularCuartiles, calcularMedia, calcularDesviacionEstandarMuestral } from '../descriptive-statistics/EstadisticaDescriptiva';

// Mejora 4 (Análisis de Datos General) — Fase 4. Detección de valores
// atípicos por columna numérica con el criterio estándar de rango
// intercuartílico: atípico si cae por debajo de Q1 - 1.5×IQR o por encima
// de Q3 + 1.5×IQR. Reutiliza calcularCuartiles (EstadisticaDescriptiva.ts,
// genérico desde Fase 0) en vez de recalcular percentiles a mano.
const MULTIPLICADOR_IQR = 1.5;

// M-15 (RF-119): segundo criterio, desviación estándar (regla de las 3
// sigma: atípico si |x - media| > 3×desviación estándar muestral). 3 en vez
// de 2 — más conservador, evita sobre-marcar en distribuciones con algo de
// cola (decisión tomada al planear esta ronda, sin un valor fijado por el
// RF). Ambos criterios corren SIEMPRE en paralelo, ninguno reemplaza al
// otro ni "gana" si difieren — el RF solo pide mostrar ambos, nunca decidir
// ni eliminar nada automáticamente; ver ValorAtipico.detectadoPor, que dice
// cuál(es) de los dos marcó cada valor.
const MULTIPLICADOR_SIGMA = 3;

export interface ColumnaExcluidaDeOutliers {
  nombre: string;
  motivo: string;
}

export type CriterioDeteccionOutlier = 'iqr' | 'desviacion_estandar';

export interface ValorAtipico {
  filaIndice: number;
  valor: number;
  // Qué criterio(s) marcaron este valor — puede ser uno solo o ambos. Un
  // valor marcado por ambos es un atípico "fuerte"; marcado por uno solo es
  // más discutible, y es información real que antes de esta ronda no
  // existía (con un único criterio, "atípico" era una etiqueta binaria).
  detectadoPor: CriterioDeteccionOutlier[];
}

// Carrier intermedio de extraerValidosConIndice — deliberadamente SIN
// detectadoPor: en esta etapa todavía no se decidió qué es atípico, es solo
// "valor numérico válido con su índice de fila". Separarlo de ValorAtipico
// evita tener que inventarle un detectadoPor vacío a algo que ni siquiera
// se evaluó todavía.
interface ValorConIndice {
  filaIndice: number;
  valor: number;
}

export interface OutliersColumna {
  columna: string;
  q1: number;
  q3: number;
  rangoIntercuartilico: number;
  limiteInferior: number;
  limiteSuperior: number;
  media: number;
  desviacionEstandar: number;
  limiteInferiorSigma: number;
  limiteSuperiorSigma: number;
  cantidadValoresAtipicos: number;
  valoresAtipicos: ValorAtipico[];
}

export interface ResultadoDeteccionOutliers {
  columnas: OutliersColumna[];
  columnasExcluidas: ColumnaExcluidaDeOutliers[];
}

function aNumero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

// filaIndice queda expuesto junto al valor para que el frontend pueda
// señalar exactamente qué fila del dataset original es la atípica, no solo
// "hay 3 valores raros" sin poder ubicarlos.
function extraerValidosConIndice(filas: Array<Record<string, unknown>>, nombreColumna: string): ValorConIndice[] {
  return filas
    .map((fila, filaIndice) => ({ filaIndice, valorCrudo: fila[nombreColumna] }))
    .filter((entrada) => !esVacio(entrada.valorCrudo) && esNumerico(entrada.valorCrudo))
    .map((entrada) => ({ filaIndice: entrada.filaIndice, valor: aNumero(entrada.valorCrudo) }));
}

function detectarOutliersColumna(nombre: string, filas: Array<Record<string, unknown>>): OutliersColumna {
  const valores = extraerValidosConIndice(filas, nombre);
  const numeros = valores.map((entrada) => entrada.valor);

  const { q1, q3 } = calcularCuartiles(numeros);
  const rangoIntercuartilico = q3 - q1;
  const limiteInferior = q1 - MULTIPLICADOR_IQR * rangoIntercuartilico;
  const limiteSuperior = q3 + MULTIPLICADOR_IQR * rangoIntercuartilico;

  const media = calcularMedia(numeros);
  const desviacionEstandar = calcularDesviacionEstandarMuestral(numeros);
  const limiteInferiorSigma = media - MULTIPLICADOR_SIGMA * desviacionEstandar;
  const limiteSuperiorSigma = media + MULTIPLICADOR_SIGMA * desviacionEstandar;

  const valoresAtipicos: ValorAtipico[] = [];
  valores.forEach((entrada) => {
    const detectadoPor: CriterioDeteccionOutlier[] = [];
    if (entrada.valor < limiteInferior || entrada.valor > limiteSuperior) detectadoPor.push('iqr');
    if (entrada.valor < limiteInferiorSigma || entrada.valor > limiteSuperiorSigma) detectadoPor.push('desviacion_estandar');
    if (detectadoPor.length > 0) {
      valoresAtipicos.push({ filaIndice: entrada.filaIndice, valor: entrada.valor, detectadoPor });
    }
  });

  return {
    columna: nombre,
    q1,
    q3,
    rangoIntercuartilico,
    limiteInferior,
    limiteSuperior,
    media,
    desviacionEstandar,
    limiteInferiorSigma,
    limiteSuperiorSigma,
    cantidadValoresAtipicos: valoresAtipicos.length,
    valoresAtipicos
  };
}

export function detectarOutliers(columnas: string[], filas: Array<Record<string, unknown>>): ResultadoDeteccionOutliers {
  const columnasExcluidas: ColumnaExcluidaDeOutliers[] = [];
  const resultado: OutliersColumna[] = [];

  columnas.forEach((nombre) => {
    const valoresCrudos = filas.map((fila) => fila[nombre]);
    if (inferirTipoColumna(valoresCrudos) !== 'numerica') {
      columnasExcluidas.push({ nombre, motivo: 'La columna no es numérica' });
      return;
    }

    const cantidadValida = valoresCrudos.filter((valor) => !esVacio(valor) && esNumerico(valor)).length;
    if (cantidadValida < 2) {
      columnasExcluidas.push({ nombre, motivo: 'Menos de 2 valores numéricos válidos' });
      return;
    }

    resultado.push(detectarOutliersColumna(nombre, filas));
  });

  return { columnas: resultado, columnasExcluidas };
}
