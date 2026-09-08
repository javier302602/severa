import {
  TipoColumna,
  TipoColumnaDetallado,
  esVacio,
  calzaConTipo,
  inferirTipoColumna,
  inferirTipoColumnaDetallado
} from '../variable-detection/DetectorDeTipoDeColumna';

// M-14 (RF-106): "tipo de dato crudo" — el tipo de JS/almacenamiento real de
// los valores, DISTINTO del tipo semántico de DetectorDeTipoDeColumna (una
// columna "fecha" leída de un .xlsx con celdas de fecha reales tiene
// tipoDatoCrudo='fecha' porque son objetos Date de verdad; la misma columna
// semántica leída de un .csv/.json tiene tipoDatoCrudo='texto', porque ahí
// nunca hay un Date real, solo un string que PARECE fecha — es información
// que RF-107 por sí solo no distingue).
export type TipoDatoCrudo = 'texto' | 'numero' | 'booleano' | 'fecha' | 'mixto' | 'nulo';

function inferirTipoDatoCrudo(valores: unknown[]): TipoDatoCrudo {
  const noVacios = valores.filter((valor) => !esVacio(valor));
  if (noVacios.length === 0) return 'nulo';

  const tiposCrudos = new Set(
    noVacios.map((valor) => {
      if (valor instanceof Date) return 'fecha';
      if (typeof valor === 'number') return 'numero';
      if (typeof valor === 'boolean') return 'booleano';
      return 'texto';
    })
  );

  return tiposCrudos.size === 1 ? ([...tiposCrudos][0] as TipoDatoCrudo) : 'mixto';
}

// Mejora 4 — Fase 2. Diagnóstico de calidad por columna: cuántos valores
// faltan, cuántos "valores únicos" tiene (indicio de cardinalidad) y cuántos
// no calzan con el tipo ya inferido para esa columna (ver comentario de
// UMBRAL_MAYORIA en DetectorDeTipoDeColumna.ts — esos son precisamente la
// minoría de valores que no siguieron la mayoría al clasificar el tipo).
//
// tipoDetallado/esIdentificador/tipoDatoCrudo (M-14, RF-106/107/109) son
// opcionales a propósito: cualquier objeto DiagnosticoColumna construido a
// mano en un test existente (no vía analizarColumna()) sigue compilando sin
// tocarlo. El código real (analizarColumna, más abajo) siempre los completa.
export interface DiagnosticoColumna {
  nombre: string;
  tipo: TipoColumna;
  tipoDetallado?: TipoColumnaDetallado;
  esIdentificador?: boolean;
  tipoDatoCrudo?: TipoDatoCrudo;
  valoresFaltantes: number;
  porcentajeFaltante: number;
  valoresUnicos: number;
  valoresInconsistentes: number;
}

export interface DiagnosticoDataset {
  totalFilas: number;
  filasDuplicadas: number;
  columnas: DiagnosticoColumna[];
  // M-14 (RF-106): % de completitud del dataset completo, no solo por
  // columna — 100 - (total de valores faltantes entre todas las columnas /
  // (totalFilas * cantidad de columnas)) * 100. Opcional por el mismo
  // motivo que los campos nuevos de DiagnosticoColumna.
  completitudGeneral?: number;
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
  const tipoDetallado = inferirTipoColumnaDetallado(valores);
  const noVacios = valores.filter((valor) => !esVacio(valor));
  const faltantes = valores.length - noVacios.length;
  const inconsistentes = noVacios.filter((valor) => !calzaConTipo(valor, tipo)).length;
  const valoresUnicos = new Set(noVacios.map((valor) => String(valor).trim().toLowerCase())).size;

  return {
    nombre,
    tipo,
    tipoDetallado,
    esIdentificador: tipoDetallado === 'identificador',
    tipoDatoCrudo: inferirTipoDatoCrudo(valores),
    valoresFaltantes: faltantes,
    porcentajeFaltante: valores.length === 0 ? 0 : (faltantes / valores.length) * 100,
    valoresUnicos,
    valoresInconsistentes: inconsistentes
  };
}

export function analizarDataset(columnas: string[], filas: Array<Record<string, unknown>>): DiagnosticoDataset {
  const columnasAnalizadas = columnas.map((nombre) => analizarColumna(nombre, filas.map((fila) => fila[nombre])));

  const totalCeldas = filas.length * columnas.length;
  const totalFaltantes = columnasAnalizadas.reduce((acumulado, columna) => acumulado + columna.valoresFaltantes, 0);

  return {
    totalFilas: filas.length,
    filasDuplicadas: contarFilasDuplicadas(columnas, filas),
    columnas: columnasAnalizadas,
    completitudGeneral: totalCeldas === 0 ? 100 : 100 - (totalFaltantes / totalCeldas) * 100
  };
}
