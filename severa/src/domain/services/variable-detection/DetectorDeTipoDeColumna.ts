// Mejora 4 (Análisis de Datos General) — Fase 2. Módulo NUEVO y separado del
// resto de SEVERA: no reutiliza ni modifica nada de los 13 módulos de
// vulnerabilidades. Infiere el tipo de una columna a partir de sus propios
// valores, sin que el llamador tenga que declarar de antemano qué campos
// espera (a diferencia de LectorExcelDataset.ts, que sí asume nombres de
// columna fijos porque el dataset de vulnerabilidades tiene un esquema
// conocido).
export type TipoColumna = 'numerica' | 'categorica' | 'fecha' | 'texto';

// No se exige el 100% de los valores para clasificar un tipo: un dataset
// real casi siempre tiene alguna celda con error de tipeo ("N/A" en una
// columna numérica) sin que eso deba degradar toda la columna a texto. Con
// un umbral de mayoría, esas celdas quedan como "valores inconsistentes"
// reportados por CalidadDeDatosGenerico.ts, no como motivo para no detectar
// el tipo real de la columna.
const UMBRAL_MAYORIA = 0.8;

// Si los valores únicos son una proporción baja del total, se interpreta
// como un conjunto acotado de categorías (ej. "Ciudad") en vez de texto
// libre (ej. una descripción). Es una heurística, no una regla exacta —
// documentada como tal, no una verdad matemática.
const UMBRAL_CARDINALIDAD_CATEGORICA = 0.5;

const PATRON_FECHA_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})([T ]\d{1,2}:\d{2}(:\d{2})?)?$/;
const PATRON_FECHA_DIA_MES_ANIO = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

export function esVacio(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
}

export function esNumerico(valor: unknown): boolean {
  if (typeof valor === 'number') return Number.isFinite(valor);
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto === '') return false;
    return Number.isFinite(Number(texto));
  }
  return false;
}

// Los valores Date reales (xlsx con celdas de fecha, ver LectorDatasetGenerico.ts
// que lee con cellDates:true) se detectan directo. Para strings se exige un
// formato reconocible (ISO o DD/MM/AAAA) — y DD/MM/AAAA se valida a mano
// (día/mes/año por posición) en vez de delegar en Date.parse(), que
// interpreta "15/01/2024" como MM/DD/AAAA (mes 15 inválido) y devuelve NaN
// aunque el string sea una fecha perfectamente válida en formato
// día/mes/año — bug real encontrado escribiendo el test de este archivo.
export function esFecha(valor: unknown): boolean {
  if (valor instanceof Date) return !Number.isNaN(valor.getTime());
  if (typeof valor !== 'string') return false;

  const texto = valor.trim();

  if (PATRON_FECHA_ISO.test(texto)) {
    return !Number.isNaN(Date.parse(texto));
  }

  const coincidencia = PATRON_FECHA_DIA_MES_ANIO.exec(texto);
  if (coincidencia) {
    const dia = Number(coincidencia[1]);
    const mes = Number(coincidencia[2]);
    return dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12;
  }

  return false;
}

export function calzaConTipo(valor: unknown, tipo: TipoColumna): boolean {
  if (tipo === 'numerica') return esNumerico(valor);
  if (tipo === 'fecha') return esFecha(valor);
  // categórica/texto no tienen un formato propio que validar: cualquier
  // valor no vacío "calza" con ellas por definición.
  return true;
}

export function inferirTipoColumna(valores: unknown[]): TipoColumna {
  const noVacios = valores.filter((valor) => !esVacio(valor));
  // Columna enteramente vacía: no hay evidencia para inferir nada, se
  // degrada a 'texto' en vez de adivinar un tipo sin datos que lo respalden.
  if (noVacios.length === 0) return 'texto';

  const proporcion = (predicado: (valor: unknown) => boolean) =>
    noVacios.filter(predicado).length / noVacios.length;

  if (proporcion(esNumerico) >= UMBRAL_MAYORIA) return 'numerica';
  if (proporcion(esFecha) >= UMBRAL_MAYORIA) return 'fecha';

  const valoresUnicos = new Set(noVacios.map((valor) => String(valor).trim().toLowerCase())).size;
  const cardinalidadRelativa = valoresUnicos / noVacios.length;
  if (cardinalidadRelativa <= UMBRAL_CARDINALIDAD_CATEGORICA) return 'categorica';

  return 'texto';
}
