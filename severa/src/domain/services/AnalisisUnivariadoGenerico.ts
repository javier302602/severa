import { TipoColumna, esVacio, esNumerico, inferirTipoColumna } from './DetectorDeTipoDeColumna';
import {
  calcularModa,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion,
  calcularResumenCincoNumeros,
  ResumenCincoNumeros
} from './EstadisticaDescriptiva';
import { generarTablaAgrupada, TablaFrecuencia } from './DistribucionFrecuencias';
import { DatasetInvalidoError } from '../errors/DatasetInvalidoError';

// Mejora 4 (Análisis de Datos General) — Fase 3. A diferencia de
// EstadisticasDescriptivasGenerico.ts (resumen liviano de TODAS las
// columnas), esto analiza UNA sola columna elegida por el analista, a
// fondo: distribución completa (no solo el top 5) y, para numéricas, un
// histograma con bins calculados automáticamente a partir de los propios
// datos — generarTablaAgrupada (DistribucionFrecuencias.ts) ya soporta
// intervalos custom, así que se reutiliza tal cual en vez de reimplementar
// el agrupamiento; lo único nuevo acá es CÓMO se calculan esos intervalos
// para una columna genérica (no hay un rango fijo como el 0-10 de CVSS).
const CANTIDAD_MINIMA_INTERVALOS = 3;
const CANTIDAD_MAXIMA_INTERVALOS = 10;

export interface AnalisisUnivariadoNumerico {
  tipo: 'numerica';
  nombre: string;
  valoresValidos: number;
  valoresFaltantes: number;
  resumenCincoNumeros: ResumenCincoNumeros;
  moda: number[];
  varianza: number | null;
  desviacionEstandar: number | null;
  coeficienteVariacion: number | null;
  distribucion: TablaFrecuencia[];
}

export interface AnalisisUnivariadoCategorico {
  tipo: 'categorica' | 'texto';
  nombre: string;
  valoresValidos: number;
  valoresFaltantes: number;
  valoresUnicos: number;
  moda: string[];
  distribucion: Array<{ valor: string; frecuenciaAbsoluta: number; frecuenciaRelativaPorcentaje: number }>;
}

export interface AnalisisUnivariadoFecha {
  tipo: 'fecha';
  nombre: string;
  valoresValidos: number;
  valoresFaltantes: number;
  minimo: string | null;
  maximo: string | null;
  distribucion: Array<{ valor: string; frecuenciaAbsoluta: number; frecuenciaRelativaPorcentaje: number }>;
}

export type AnalisisUnivariado = AnalisisUnivariadoNumerico | AnalisisUnivariadoCategorico | AnalisisUnivariadoFecha;

function aNumero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

function aFecha(valor: unknown): Date {
  return valor instanceof Date ? valor : new Date(String(valor));
}

// Regla de Sturges (k = ceil(log2(n) + 1)), acotada entre 3 y 10 intervalos
// para que la tabla siga siendo legible tanto con pocos valores como con
// miles. Si todos los valores son idénticos no hay ancho que repartir: un
// único intervalo que los contiene a todos.
function generarIntervalosAutomaticos(valores: number[]): Array<{ inferior: number; superior: number }> {
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);

  if (minimo === maximo) {
    return [{ inferior: minimo, superior: maximo }];
  }

  const cantidadIntervalos = Math.min(
    CANTIDAD_MAXIMA_INTERVALOS,
    Math.max(CANTIDAD_MINIMA_INTERVALOS, Math.ceil(Math.log2(valores.length) + 1))
  );
  const ancho = (maximo - minimo) / cantidadIntervalos;

  return Array.from({ length: cantidadIntervalos }, (_, indice) => ({
    inferior: redondear(minimo + indice * ancho),
    superior: indice === cantidadIntervalos - 1 ? maximo : redondear(minimo + (indice + 1) * ancho)
  }));
}

// Sin esto, dividir un rango arbitrario en N partes iguales deja restos de
// coma flotante en los límites (ej. 36.400000000000006 en vez de 36.4) —
// visible en la tabla de distribución del informe (Fase 5), confirmado
// generando el informe real. Los intervalos con límites fijos de CVSS
// (DistribucionFrecuencias.ts) nunca lo sufren porque sus límites ya son
// enteros exactos; acá sí hace falta porque el ancho de cada intervalo se
// calcula en el momento a partir de min/max de la columna.
function redondear(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

function generarDistribucionCategorica(
  valores: unknown[]
): Array<{ valor: string; frecuenciaAbsoluta: number; frecuenciaRelativaPorcentaje: number }> {
  const normalizados = valores.map((valor) => String(valor).trim());
  const frecuencia = new Map<string, number>();
  normalizados.forEach((valor) => frecuencia.set(valor, (frecuencia.get(valor) ?? 0) + 1));
  const total = normalizados.length;

  return [...frecuencia.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([valor, frecuenciaAbsoluta]) => ({
      valor,
      frecuenciaAbsoluta,
      frecuenciaRelativaPorcentaje: total === 0 ? 0 : (frecuenciaAbsoluta / total) * 100
    }));
}

function analizarNumerica(nombre: string, noVacios: unknown[], valoresFaltantes: number): AnalisisUnivariadoNumerico {
  // Invariante de inferirTipoColumna: tipo 'numerica' implica que al menos
  // el 80% de noVacios pasa esNumerico, así que con noVacios no vacío este
  // filtro tampoco lo está.
  const numeros = noVacios.filter(esNumerico).map(aNumero);
  const resumen = calcularResumenCincoNumeros(numeros);

  return {
    tipo: 'numerica',
    nombre,
    valoresValidos: numeros.length,
    valoresFaltantes,
    resumenCincoNumeros: resumen,
    moda: calcularModa(numeros),
    varianza: numeros.length >= 2 ? calcularVarianzaMuestral(numeros) : null,
    desviacionEstandar: numeros.length >= 2 ? calcularDesviacionEstandarMuestral(numeros) : null,
    coeficienteVariacion: numeros.length >= 2 && resumen.media !== 0 ? calcularCoeficienteVariacion(numeros) : null,
    distribucion: generarTablaAgrupada(numeros, generarIntervalosAutomaticos(numeros), nombre)
  };
}

function analizarFecha(nombre: string, noVacios: unknown[], valoresFaltantes: number): AnalisisUnivariadoFecha {
  const fechas = noVacios
    .map(aFecha)
    .filter((fecha) => !Number.isNaN(fecha.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  // Se agrupa por día calendario (AAAA-MM-DD): una distribución por
  // timestamp exacto sería casi siempre "1 de cada valor" y no aportaría
  // nada legible.
  const distribucion = generarDistribucionCategorica(
    noVacios.map((valor) => aFecha(valor).toISOString().slice(0, 10))
  );

  return {
    tipo: 'fecha',
    nombre,
    valoresValidos: fechas.length,
    valoresFaltantes,
    minimo: fechas[0]?.toISOString() ?? null,
    maximo: fechas[fechas.length - 1]?.toISOString() ?? null,
    distribucion
  };
}

function analizarCategorica(
  nombre: string,
  tipo: 'categorica' | 'texto',
  noVacios: unknown[],
  valoresFaltantes: number
): AnalisisUnivariadoCategorico {
  const distribucion = generarDistribucionCategorica(noVacios);
  const maxFrecuencia = distribucion[0]?.frecuenciaAbsoluta ?? 0;

  return {
    tipo,
    nombre,
    valoresValidos: noVacios.length,
    valoresFaltantes,
    valoresUnicos: distribucion.length,
    moda: distribucion.filter((entrada) => entrada.frecuenciaAbsoluta === maxFrecuencia).map((entrada) => entrada.valor),
    distribucion
  };
}

export function analizarColumnaUnivariado(
  nombreColumna: string,
  columnas: string[],
  filas: Array<Record<string, unknown>>
): AnalisisUnivariado {
  if (!columnas.includes(nombreColumna)) {
    throw new DatasetInvalidoError(`La columna "${nombreColumna}" no existe en este dataset`);
  }

  const valoresCrudos = filas.map((fila) => fila[nombreColumna]);
  const noVacios = valoresCrudos.filter((valor) => !esVacio(valor));
  const tipo: TipoColumna = inferirTipoColumna(valoresCrudos);
  const valoresFaltantes = valoresCrudos.length - noVacios.length;

  if (tipo === 'numerica') return analizarNumerica(nombreColumna, noVacios, valoresFaltantes);
  if (tipo === 'fecha') return analizarFecha(nombreColumna, noVacios, valoresFaltantes);
  return analizarCategorica(nombreColumna, tipo, noVacios, valoresFaltantes);
}
