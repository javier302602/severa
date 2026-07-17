import { TipoColumna, esVacio, calzaConTipo, inferirTipoColumna } from './DetectorDeTipoDeColumna';

// Mejora 4 — Fase 2. Diagnóstico de calidad por columna: cuántos valores
// faltan, cuántos "valores únicos" tiene (indicio de cardinalidad) y cuántos
// no calzan con el tipo ya inferido para esa columna (ver comentario de
// UMBRAL_MAYORIA en DetectorDeTipoDeColumna.ts — esos son precisamente la
// minoría de valores que no siguieron la mayoría al clasificar el tipo).
export interface DiagnosticoColumna {
  nombre: string;
  tipo: TipoColumna;
  valoresFaltantes: number;
  porcentajeFaltante: number;
  valoresUnicos: number;
  valoresInconsistentes: number;
}

export interface DiagnosticoDataset {
  totalFilas: number;
  filasDuplicadas: number;
  columnas: DiagnosticoColumna[];
}

// Cuenta cuántas filas son copias exactas de una fila ya vista antes (no
// cuenta la primera aparición de cada grupo de duplicados, solo las
// repeticiones) — mismo criterio que usaría un analista revisando "¿cuántos
// registros de más tengo?", no "¿cuántos grupos de duplicados hay?".
function contarFilasDuplicadas(columnas: string[], filas: Array<Record<string, unknown>>): number {
  const vistos = new Map<string, number>();
  filas.forEach((fila) => {
    const clave = JSON.stringify(columnas.map((columna) => fila[columna]));
    vistos.set(clave, (vistos.get(clave) ?? 0) + 1);
  });

  let duplicadas = 0;
  vistos.forEach((conteo) => {
    if (conteo > 1) duplicadas += conteo - 1;
  });
  return duplicadas;
}

function analizarColumna(nombre: string, valores: unknown[]): DiagnosticoColumna {
  const tipo = inferirTipoColumna(valores);
  const noVacios = valores.filter((valor) => !esVacio(valor));
  const faltantes = valores.length - noVacios.length;
  const inconsistentes = noVacios.filter((valor) => !calzaConTipo(valor, tipo)).length;
  const valoresUnicos = new Set(noVacios.map((valor) => String(valor).trim().toLowerCase())).size;

  return {
    nombre,
    tipo,
    valoresFaltantes: faltantes,
    porcentajeFaltante: valores.length === 0 ? 0 : (faltantes / valores.length) * 100,
    valoresUnicos,
    valoresInconsistentes: inconsistentes
  };
}

export function analizarDataset(columnas: string[], filas: Array<Record<string, unknown>>): DiagnosticoDataset {
  return {
    totalFilas: filas.length,
    filasDuplicadas: contarFilasDuplicadas(columnas, filas),
    columnas: columnas.map((nombre) => analizarColumna(nombre, filas.map((fila) => fila[nombre])))
  };
}
