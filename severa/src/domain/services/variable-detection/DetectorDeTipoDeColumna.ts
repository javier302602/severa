// Mejora 4 (Análisis de Datos General) — Fase 2. Módulo NUEVO y separado del
// resto de SEVERA: no reutiliza ni modifica nada de los 13 módulos de
// vulnerabilidades. Infiere el tipo de una columna a partir de sus propios
// valores, sin que el llamador tenga que declarar de antemano qué campos
// espera (a diferencia de LectorExcelDataset.ts, que sí asume nombres de
// columna fijos porque el dataset de vulnerabilidades tiene un esquema
// conocido).
export type TipoColumna = 'numerica' | 'categorica' | 'fecha' | 'texto';

// M-14 (RF-107): las 9 categorías del SDS. inferirTipoColumna (de arriba)
// sigue existiendo tal cual para no tocar a sus 6 consumidores reales
// (CalidadDeDatosGenerico, EstadisticasDescriptivasGenerico,
// AnalisisUnivariadoGenerico, CorrelacionGenerico, DeteccionOutliersGenerico,
// ConfigurarCriterioDeClasificacion) — queda definida como el mapeo de este
// tipo más detallado, nunca al revés. Ver MAPEO_A_TIPO_LEGADO y el comentario
// de inferirTipoColumnaDetallado: cada categoría nueva nace DENTRO de uno de
// los 4 buckets de siempre, nunca cruza a otro, así que el mapeo de vuelta
// coincide con inferirTipoColumna tal como se comportaba antes de esta
// ampliación, para cualquier entrada — no es una coincidencia verificada a
// mano, es una garantía de la propia estructura del código (ver test de
// propiedad en DetectorDeTipoDeColumna.test.ts).
export type TipoColumnaDetallado =
  | 'numerica_continua'
  | 'numerica_discreta'
  | 'categorica_nominal'
  | 'categorica_ordinal'
  | 'binaria'
  | 'fecha'
  | 'fecha_hora'
  | 'texto_libre'
  | 'identificador';

// Exportado (no solo uso interno) para que el test de propiedad pueda
// verificar la relación real entre inferirTipoColumnaDetallado e
// inferirTipoColumna, en vez de asumirla.
export const MAPEO_A_TIPO_LEGADO: Record<TipoColumnaDetallado, TipoColumna> = {
  numerica_continua: 'numerica',
  numerica_discreta: 'numerica',
  categorica_nominal: 'categorica',
  categorica_ordinal: 'categorica',
  // Decisión de diseño (revisada y confirmada): "binaria" solo se corta del
  // bucket categórico. Una columna numérica de solo 0/1 sigue siendo
  // numerica_discreta, no binaria — así "binaria" nace de un único bucket de
  // origen y el mapeo de vuelta queda sin ambigüedad (un Record estático de
  // 1 a 1, nunca "depende de dónde vino").
  binaria: 'categorica',
  fecha: 'fecha',
  fecha_hora: 'fecha',
  texto_libre: 'texto',
  // "identificador" se corta del bucket texto (cardinalidad ya > 0.5 para
  // llegar ahí) — nunca del numérico/categórico, por el mismo motivo.
  identificador: 'texto'
};

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

// RF-109: dentro del bucket texto (cardinalidad ya > 0.5), una cardinalidad
// todavía más alta sugiere que cada valor identifica una fila distinta (ej.
// un UUID, un código de empleado) en vez de ser prosa libre. Umbral y
// mínimo de muestra ajustables — con menos de MINIMO_MUESTRA_IDENTIFICADOR
// valores no vacíos, "casi todos distintos" no es una señal confiable (un
// dataset de 3 filas con 3 valores distintos no prueba nada por sí solo).
const UMBRAL_IDENTIFICADOR = 0.9;
const MINIMO_MUESTRA_IDENTIFICADOR = 5;

const PATRON_FECHA_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})([T ]\d{1,2}:\d{2}(:\d{2})?)?$/;
const PATRON_FECHA_DIA_MES_ANIO = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

// RF-107 (categórica ordinal): heurística de diccionario, deliberadamente NO
// exhaustiva — no hay forma de saber por contenido si "Rojo/Verde/Azul"
// tiene o no un orden implícito, así que se compara contra escalas
// conocidas. Una escala ordinal real con etiquetas fuera de esta lista (ej.
// "Freshman/Sophomore/Junior/Senior") cae en "nominal" por defecto: es una
// limitación real, documentada, no un bug — mismo espíritu que
// UMBRAL_CARDINALIDAD_CATEGORICA de arriba. Ampliable sin romper nada (es
// solo más filas de esta lista).
const ESCALAS_ORDINALES_CONOCIDAS: string[][] = [
  ['bajo', 'medio', 'alto'],
  ['muy bajo', 'bajo', 'medio', 'alto', 'muy alto'],
  ['pequeno', 'mediano', 'grande'],
  ['low', 'medium', 'high'],
  ['small', 'medium', 'large'],
  ['nunca', 'a veces', 'siempre'],
  ['malo', 'regular', 'bueno', 'excelente'],
  ['pesimo', 'malo', 'regular', 'bueno', 'excelente'],
  ['insatisfecho', 'neutral', 'satisfecho'],
  ['en desacuerdo', 'neutral', 'de acuerdo'],
  ['principiante', 'intermedio', 'avanzado'],
  ['basico', 'intermedio', 'avanzado'],
  ['pendiente', 'en proceso', 'completado']
];

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

function aNumeroSeguro(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

// Quita tildes/diacríticos y normaliza mayúsculas/espacios — para que
// "Bajo", "BAJO" o "bájo" (typo con tilde de más) comparen igual contra
// ESCALAS_ORDINALES_CONOCIDAS.
const RANGO_DIACRITICOS_COMBINABLES = /[̀-ͯ]/g;

function normalizarTexto(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(RANGO_DIACRITICOS_COMBINABLES, '');
}

function clasificarNumerica(noVacios: unknown[]): 'numerica_continua' | 'numerica_discreta' {
  const numeros = noVacios.filter(esNumerico).map(aNumeroSeguro);
  const todosEnteros = numeros.every((numero) => Number.isInteger(numero));
  return todosEnteros ? 'numerica_discreta' : 'numerica_continua';
}

// true si ALGÚN valor de la columna trae un componente de hora — deliberado
// (no "la mayoría"): si la columna es capaz de llevar hora, tratarla como
// fecha_hora es la lectura más conservadora (perder precisión horaria por
// mayoría sería peor que sobrestimarla).
function tieneComponenteHora(valor: unknown): boolean {
  if (valor instanceof Date) {
    return valor.getHours() !== 0 || valor.getMinutes() !== 0 || valor.getSeconds() !== 0;
  }
  if (typeof valor === 'string') {
    const coincidencia = PATRON_FECHA_ISO.exec(valor.trim());
    return Boolean(coincidencia && coincidencia[4]);
  }
  return false;
}

function clasificarFecha(noVacios: unknown[]): 'fecha' | 'fecha_hora' {
  return noVacios.some(tieneComponenteHora) ? 'fecha_hora' : 'fecha';
}

function esEscalaOrdinalConocida(valoresUnicosNormalizados: Set<string>): boolean {
  return ESCALAS_ORDINALES_CONOCIDAS.some((escala) => {
    const escalaSet = new Set(escala);
    return [...valoresUnicosNormalizados].every((valor) => escalaSet.has(valor));
  });
}

function clasificarCategorica(noVacios: unknown[]): 'binaria' | 'categorica_nominal' | 'categorica_ordinal' {
  const valoresUnicosNormalizados = new Set(noVacios.map((valor) => normalizarTexto(String(valor))));
  if (valoresUnicosNormalizados.size === 2) return 'binaria';
  return esEscalaOrdinalConocida(valoresUnicosNormalizados) ? 'categorica_ordinal' : 'categorica_nominal';
}

function clasificarTexto(noVacios: unknown[]): 'identificador' | 'texto_libre' {
  if (noVacios.length < MINIMO_MUESTRA_IDENTIFICADOR) return 'texto_libre';
  const valoresUnicos = new Set(noVacios.map((valor) => String(valor).trim().toLowerCase())).size;
  const cardinalidadRelativa = valoresUnicos / noVacios.length;
  return cardinalidadRelativa >= UMBRAL_IDENTIFICADOR ? 'identificador' : 'texto_libre';
}

// RF-107: mismo árbol de decisión de 4 ramas que inferirTipoColumna siempre
// tuvo (numérica -> fecha -> categórica -> texto, con los mismos umbrales,
// en el mismo orden) — el refinamiento a 9 categorías ocurre DENTRO de cada
// rama, nunca cambia a qué rama entra un valor. Ver MAPEO_A_TIPO_LEGADO.
export function inferirTipoColumnaDetallado(valores: unknown[]): TipoColumnaDetallado {
  const noVacios = valores.filter((valor) => !esVacio(valor));
  if (noVacios.length === 0) return 'texto_libre';

  const proporcion = (predicado: (valor: unknown) => boolean) =>
    noVacios.filter(predicado).length / noVacios.length;

  if (proporcion(esNumerico) >= UMBRAL_MAYORIA) return clasificarNumerica(noVacios);
  if (proporcion(esFecha) >= UMBRAL_MAYORIA) return clasificarFecha(noVacios);

  const valoresUnicos = new Set(noVacios.map((valor) => String(valor).trim().toLowerCase())).size;
  const cardinalidadRelativa = valoresUnicos / noVacios.length;
  if (cardinalidadRelativa <= UMBRAL_CARDINALIDAD_CATEGORICA) return clasificarCategorica(noVacios);

  return clasificarTexto(noVacios);
}

export function inferirTipoColumna(valores: unknown[]): TipoColumna {
  return MAPEO_A_TIPO_LEGADO[inferirTipoColumnaDetallado(valores)];
}

// RF-109: "posible identificador" es exactamente la categoría detallada
// 'identificador' — mismo detector, sin lógica duplicada. Los 6 consumidores
// de inferirTipoColumna no necesitan saber que esto existe.
export function esIdentificador(valores: unknown[]): boolean {
  return inferirTipoColumnaDetallado(valores) === 'identificador';
}
