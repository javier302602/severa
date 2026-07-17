import { TipoColumna, esVacio, esNumerico, inferirTipoColumna } from './DetectorDeTipoDeColumna';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral
} from './EstadisticaDescriptiva';

// Mejora 4 (Análisis de Datos General) — Fase 3. Resumen liviano de TODAS
// las columnas del dataset (para la vista de "estadísticas descriptivas"),
// distinto de AnalisisUnivariadoGenerico.ts (que se mete a fondo en UNA sola
// columna elegida por el analista). Reutiliza las fórmulas puras de
// EstadisticaDescriptiva.ts (ya generalizadas en Fase 0 de esta mejora para
// operar sobre cualquier número, no solo CVSS Score) — no duplica media/
// mediana/etc., solo agrega el branching por tipo de columna que ese
// archivo no conoce.
const CANTIDAD_MAS_FRECUENTES = 5;

export interface ResumenColumnaNumerica {
  tipo: 'numerica';
  nombre: string;
  valoresValidos: number;
  media: number;
  mediana: number;
  moda: number[];
  minimo: number;
  maximo: number;
  q1: number;
  q3: number;
  rango: number;
  varianza: number | null;
  desviacionEstandar: number | null;
}

export interface ResumenColumnaCategorica {
  tipo: 'categorica' | 'texto';
  nombre: string;
  valoresValidos: number;
  valoresUnicos: number;
  masFrecuente: Array<{ valor: string; frecuencia: number }>;
}

export interface ResumenColumnaFecha {
  tipo: 'fecha';
  nombre: string;
  valoresValidos: number;
  minimo: string | null;
  maximo: string | null;
}

export type ResumenColumna = ResumenColumnaNumerica | ResumenColumnaCategorica | ResumenColumnaFecha;

function aNumero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

function aFecha(valor: unknown): Date {
  return valor instanceof Date ? valor : new Date(String(valor));
}

function contarFrecuencias(valores: unknown[]): Map<string, number> {
  const frecuencia = new Map<string, number>();
  valores.forEach((valor) => {
    const clave = String(valor).trim();
    frecuencia.set(clave, (frecuencia.get(clave) ?? 0) + 1);
  });
  return frecuencia;
}

// Se requieren al menos 2 valores para varianza/desviación (ver
// ValorEstadisticoError en EstadisticaDescriptiva.ts) — a diferencia del CVSS
// Score (siempre hay al menos 1 vulnerabilidad cargada para calcular esto),
// una columna genérica perfectamente puede tener un solo valor no vacío, y
// eso no debería tirar un error, solo degradar a null.
function resumirNumerica(nombre: string, valores: number[]): ResumenColumnaNumerica {
  const ordenados = [...valores].sort((a, b) => a - b);
  const { q1, q3 } = calcularCuartiles(valores);

  return {
    tipo: 'numerica',
    nombre,
    valoresValidos: valores.length,
    media: calcularMedia(valores),
    mediana: calcularMediana(valores),
    moda: calcularModa(valores),
    minimo: ordenados[0],
    maximo: ordenados[ordenados.length - 1],
    q1,
    q3,
    rango: calcularRango(valores),
    varianza: valores.length >= 2 ? calcularVarianzaMuestral(valores) : null,
    desviacionEstandar: valores.length >= 2 ? calcularDesviacionEstandarMuestral(valores) : null
  };
}

function resumirCategorica(nombre: string, tipo: 'categorica' | 'texto', valores: unknown[]): ResumenColumnaCategorica {
  const frecuencia = contarFrecuencias(valores);
  const masFrecuente = [...frecuencia.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, CANTIDAD_MAS_FRECUENTES)
    .map(([valor, cantidad]) => ({ valor, frecuencia: cantidad }));

  return {
    tipo,
    nombre,
    valoresValidos: valores.length,
    valoresUnicos: frecuencia.size,
    masFrecuente
  };
}

function resumirFecha(nombre: string, valores: unknown[]): ResumenColumnaFecha {
  const fechas = valores
    .map(aFecha)
    .filter((fecha) => !Number.isNaN(fecha.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    tipo: 'fecha',
    nombre,
    valoresValidos: fechas.length,
    minimo: fechas[0]?.toISOString() ?? null,
    maximo: fechas[fechas.length - 1]?.toISOString() ?? null
  };
}

function resumirColumna(nombre: string, tipo: TipoColumna, valoresCrudos: unknown[]): ResumenColumna {
  const noVacios = valoresCrudos.filter((valor) => !esVacio(valor));

  if (tipo === 'numerica') {
    // Invariante que garantiza inferirTipoColumna: si el tipo es
    // 'numerica', al menos el 80% de noVacios pasa esNumerico, así que si
    // noVacios no está vacío, tampoco lo está este filtro.
    return resumirNumerica(nombre, noVacios.filter(esNumerico).map(aNumero));
  }
  if (tipo === 'fecha') {
    return resumirFecha(nombre, noVacios);
  }
  return resumirCategorica(nombre, tipo, noVacios);
}

export function calcularEstadisticasDescriptivas(
  columnas: string[],
  filas: Array<Record<string, unknown>>
): ResumenColumna[] {
  return columnas.map((nombre) => {
    const valoresCrudos = filas.map((fila) => fila[nombre]);
    const tipo = inferirTipoColumna(valoresCrudos);
    return resumirColumna(nombre, tipo, valoresCrudos);
  });
}
