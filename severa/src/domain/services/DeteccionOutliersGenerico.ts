import { esVacio, esNumerico, inferirTipoColumna } from './DetectorDeTipoDeColumna';
import { calcularCuartiles } from './EstadisticaDescriptiva';

// Mejora 4 (Análisis de Datos General) — Fase 4. Detección de valores
// atípicos por columna numérica con el criterio estándar de rango
// intercuartílico: atípico si cae por debajo de Q1 - 1.5×IQR o por encima
// de Q3 + 1.5×IQR. Reutiliza calcularCuartiles (EstadisticaDescriptiva.ts,
// genérico desde Fase 0) en vez de recalcular percentiles a mano.
const MULTIPLICADOR_IQR = 1.5;

export interface ColumnaExcluidaDeOutliers {
  nombre: string;
  motivo: string;
}

export interface ValorAtipico {
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
function extraerValidosConIndice(filas: Array<Record<string, unknown>>, nombreColumna: string): ValorAtipico[] {
  return filas
    .map((fila, filaIndice) => ({ filaIndice, valorCrudo: fila[nombreColumna] }))
    .filter((entrada) => !esVacio(entrada.valorCrudo) && esNumerico(entrada.valorCrudo))
    .map((entrada) => ({ filaIndice: entrada.filaIndice, valor: aNumero(entrada.valorCrudo) }));
}

function detectarOutliersColumna(nombre: string, filas: Array<Record<string, unknown>>): OutliersColumna {
  const valores = extraerValidosConIndice(filas, nombre);
  const { q1, q3 } = calcularCuartiles(valores.map((entrada) => entrada.valor));
  const rangoIntercuartilico = q3 - q1;
  const limiteInferior = q1 - MULTIPLICADOR_IQR * rangoIntercuartilico;
  const limiteSuperior = q3 + MULTIPLICADOR_IQR * rangoIntercuartilico;

  const valoresAtipicos = valores.filter((entrada) => entrada.valor < limiteInferior || entrada.valor > limiteSuperior);

  return {
    columna: nombre,
    q1,
    q3,
    rangoIntercuartilico,
    limiteInferior,
    limiteSuperior,
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
