import { esCodigoConCerosALaIzquierda, tieneLecturaAmbigua } from './LecturaDeNumerosEnTexto';

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
// Exportado para que la lectura de CSV (LecturaDeTextoDelimitado) decida con
// el mismo criterio si una columna es numérica antes de elegir su convención
// decimal, en vez de inventar otro umbral.
export const UMBRAL_MAYORIA = 0.8;

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

// Exportados (M-15, RF-118) para que CalidadDeDatosGenerico.ts pueda
// clasificar POR QUÉ formato calza cada valor de fecha (detección de
// formatos mezclados) reutilizando los mismos patrones, en vez de duplicar
// las regex — ningún comportamiento de este archivo cambia por exportarlos.
//
// El patrón ISO acepta también fracción de segundo y zona horaria
// ("2024-01-15T10:30:00.000Z", "2024-01-15T10:30:00-05:00"): es como exporta
// una marca de tiempo cualquier API o base de datos, y sin esto una columna
// así se detectaba como texto (o como identificador, por tener casi todos los
// valores distintos). Grupos: 1 año, 2 mes, 3 día, 4 la parte horaria
// completa (si hay), 5 hora, 6 minuto, 7 segundo, 8 zona.
export const PATRON_FECHA_ISO =
  /^(\d{4})-(\d{1,2})-(\d{1,2})([T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
export const PATRON_FECHA_DIA_MES_ANIO = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

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

// Un texto con cero a la izquierda ("07001", "00123") es un código, no un
// número: leerlo con Number() le borra los ceros. Lo mismo decide la lectura
// de CSV (LecturaDeNumerosEnTexto), que lo deja como texto.
export function esNumerico(valor: unknown): boolean {
  if (typeof valor === 'number') return Number.isFinite(valor);
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto === '' || esCodigoConCerosALaIzquierda(texto)) return false;
    return Number.isFinite(Number(texto));
  }
  return false;
}

// Una columna cuyos números están todos escritos como texto y todos admiten
// dos lecturas que dan números distintos ("196.627": ¿ciento noventa y seis
// mil o ciento noventa y seis coma seis?) no es numérica: Number() elegiría
// el punto decimal sin que nadie lo decidiera. La lectura de CSV deja esas
// columnas como texto y lo avisa; el detector tiene que coincidir. Basta un
// valor que desempate ("12.5", o un número de verdad) para que deje de serlo.
function esColumnaDeNumerosAmbiguos(noVacios: unknown[]): boolean {
  const comoTexto = noVacios.filter((valor): valor is string => typeof valor === 'string' && esNumerico(valor));
  return (
    comoTexto.length > 0 &&
    !noVacios.some((valor) => typeof valor === 'number') &&
    comoTexto.every(tieneLecturaAmbigua)
  );
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

  // Una sola definición: un texto es una fecha si aFechaGenerica (abajo) lo
  // puede convertir. Antes este chequeo era más laxo que la conversión — el
  // formato ISO se validaba con Date.parse, que en Node acepta "2024-02-31" y
  // lo corre al 2 de marzo, y en día/mes/año solo se miraba dia <= 31 — así
  // que un 31 de febrero contaba como fecha al detectar el tipo y después se
  // descartaba en silencio al calcular. Ahora es un valor que no calza con
  // el tipo, y el diagnóstico de calidad lo informa como inconsistente.
  const texto = valor.trim();
  if (!PATRON_FECHA_ISO.test(texto) && !PATRON_FECHA_DIA_MES_ANIO.test(texto)) return false;
  return !Number.isNaN(aFechaGenerica(texto).getTime());
}

// Conversión única de un valor crudo a Date para TODO el pipeline genérico.
// Bug real: esFecha() (arriba) acepta "15/01/2024" como fecha válida, pero los
// módulos que después calculan con esa columna convertían con
// new Date(String(valor)), que interpreta día/mes/año como mes/día/año. El
// resultado, para una columna en el formato de fecha habitual en Perú:
//   - días mayores a 12 daban Invalid Date y se descartaban en silencio
//     (EstadisticasDescriptivasGenerico reportaba menos valores válidos);
//   - el resto quedaba con día y mes intercambiados (5 de enero -> 1 de mayo),
//     así que el rango mínimo/máximo informado era falso;
//   - AnalisisUnivariadoGenerico llamaba toISOString() sobre el Invalid Date y
//     tiraba RangeError: el análisis de esa columna devolvía error.
// Los dos formatos que esFecha reconoce se convierten acá con los mismos
// patrones, por posición, sin pasar por Date.parse.
//
// Los strings se interpretan como fecha/hora "de calendario" en UTC: lo que
// el archivo dice "2024-01-15" es el 15 de enero en cualquier servidor, y
// toISOString().slice(0, 10) devuelve ese mismo día. new Date('2024-01-15
// 10:30') en cambio depende de la zona horaria del proceso. Una fecha
// imposible (31/02/2024) devuelve Invalid Date en vez de "desbordar" al 2 de
// marzo — el llamador ya filtra los inválidos.
function fechaUtcEstricta(anio: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0): Date {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo));
  // Date.UTC trata los años 0-99 como 1900-1999.
  if (anio >= 0 && anio <= 99) fecha.setUTCFullYear(anio);
  const coincide = fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  return coincide && hora <= 23 && minuto <= 59 && segundo <= 59 ? fecha : new Date(NaN);
}

// Año de dos dígitos ("15/01/24"): ventana fija 1970-2069, la misma
// convención de POSIX strptime (%y) — 00-68 es 20xx, 69-99 es 19xx.
function expandirAnio(texto: string): number {
  const anio = Number(texto);
  if (texto.length !== 2) return anio;
  return anio <= 68 ? 2000 + anio : 1900 + anio;
}

// "+05:30" -> 330, "-0500" -> -300, "Z" o sin zona -> 0.
function minutosDeDesfase(zona: string | undefined): number {
  if (zona === undefined || zona === 'Z') return 0;
  const signo = zona[0] === '-' ? -1 : 1;
  const digitos = zona.slice(1).replace(':', '');
  return signo * (Number(digitos.slice(0, 2)) * 60 + Number(digitos.slice(2, 4)));
}

export function aFechaGenerica(valor: unknown): Date {
  if (valor instanceof Date) return valor;

  const texto = String(valor).trim();

  const iso = PATRON_FECHA_ISO.exec(texto);
  if (iso) {
    const fecha = fechaUtcEstricta(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0),
      Number(iso[7] ?? 0)
    );
    // Con zona explícita el texto nombra un instante: se lleva a UTC. Sin
    // zona es una fecha/hora "de calendario" y se deja tal cual (ver arriba).
    const desfase = minutosDeDesfase(iso[8]);
    return desfase === 0 || Number.isNaN(fecha.getTime()) ? fecha : new Date(fecha.getTime() - desfase * 60_000);
  }

  const diaMesAnio = PATRON_FECHA_DIA_MES_ANIO.exec(texto);
  if (diaMesAnio) {
    return fechaUtcEstricta(expandirAnio(diaMesAnio[3]), Number(diaMesAnio[2]), Number(diaMesAnio[1]));
  }

  return new Date(NaN);
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

// Exportada (M-15, RF-118): CalidadDeDatosGenerico.ts la reutiliza para
// agrupar variantes de mayúsculas/minúsculas de una misma categoría — mismo
// criterio de "no duplicar la normalización" que ya justificó exportar los
// patrones de fecha de arriba.
export function normalizarTexto(valor: string): string {
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

  if (!esColumnaDeNumerosAmbiguos(noVacios) && proporcion(esNumerico) >= UMBRAL_MAYORIA) return clasificarNumerica(noVacios);
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

// RF-111 (M-14, Ronda 2): corrección manual del tipo detectado.
//
// La detección de arriba es una heurística (umbrales de mayoría y de
// cardinalidad): puede equivocarse — un código postal es un número para el
// detector y una categoría para quien conoce los datos. El analista puede
// fijar el tipo de cualquier columna; esa decisión viaja como un mapa
// nombre-de-columna -> tipo y TODOS los análisis del pipeline genérico lo
// consultan a través de resolverTipoColumna / resolverTipoColumnaDetallado en
// vez de llamar a inferirTipoColumna directamente. Así "recalcular los
// análisis dependientes" no es un paso aparte que pueda olvidarse: cada
// análisis se calcula siempre con el tipo vigente.
export const TIPOS_DE_COLUMNA_DETALLADOS: readonly TipoColumnaDetallado[] = [
  'numerica_continua',
  'numerica_discreta',
  'categorica_nominal',
  'categorica_ordinal',
  'binaria',
  'fecha',
  'fecha_hora',
  'texto_libre',
  'identificador'
];

// Cómo se le nombra cada tipo a una persona (mensajes de error, bitácora,
// recomendaciones). Un solo lugar, para que todo el sistema los llame igual.
export const ETIQUETA_DE_TIPO_DETALLADO: Record<TipoColumnaDetallado, string> = {
  numerica_continua: 'numérica continua',
  numerica_discreta: 'numérica discreta',
  categorica_nominal: 'categórica nominal',
  categorica_ordinal: 'categórica ordinal',
  binaria: 'binaria',
  fecha: 'fecha',
  fecha_hora: 'fecha y hora',
  texto_libre: 'texto libre',
  identificador: 'identificador'
};

export function esTipoColumnaDetallado(valor: unknown): valor is TipoColumnaDetallado {
  return typeof valor === 'string' && (TIPOS_DE_COLUMNA_DETALLADOS as readonly string[]).includes(valor);
}

export type CorreccionesDeTipo = Readonly<Record<string, TipoColumnaDetallado>>;

// Por qué un tipo NO se puede aplicar a una columna, o null si se puede.
// Las reglas son las mínimas para que ningún cálculo posterior se quede sin
// datos: tratar como numérica una columna sin un solo número dejaría la media
// sin nada que promediar. No se exige la mayoría del 80% de la detección
// automática — justamente para eso existe la corrección manual.
export function motivoDeTipoNoAplicable(tipo: TipoColumnaDetallado, valores: unknown[]): string | null {
  const noVacios = valores.filter((valor) => !esVacio(valor));
  if (noVacios.length === 0) {
    return 'la columna no tiene ningún valor';
  }

  switch (tipo) {
    case 'numerica_continua':
    case 'numerica_discreta': {
      const numeros = noVacios.filter(esNumerico).map(aNumeroSeguro);
      if (numeros.length === 0) return 'ninguno de sus valores es un número';
      if (tipo === 'numerica_discreta' && !numeros.every((numero) => Number.isInteger(numero))) {
        return 'tiene valores con decimales';
      }
      return null;
    }
    case 'fecha':
    case 'fecha_hora':
      return noVacios.some(esFecha) ? null : 'ninguno de sus valores es una fecha reconocible (AAAA-MM-DD o DD/MM/AAAA)';
    case 'binaria': {
      const distintos = new Set(noVacios.map((valor) => normalizarTexto(String(valor)))).size;
      return distintos === 2 ? null : `tiene ${distintos} valor(es) distinto(s), y una variable binaria tiene exactamente 2`;
    }
    case 'categorica_nominal':
    case 'categorica_ordinal':
    case 'texto_libre':
    case 'identificador':
      return null;
    default: {
      const exhaustivo: never = tipo;
      throw new Error(`Tipo de columna no manejado: ${String(exhaustivo)}`);
    }
  }
}

// El tipo vigente de una columna: el que fijó el analista si lo hay y sigue
// siendo aplicable; si no, el detectado. "Sigue siendo aplicable" importa
// porque los datos pueden cambiar debajo de una corrección ya guardada (una
// versión limpia del dataset puede haber perdido las filas que la hacían
// válida): en ese caso se vuelve a la detección automática en vez de fallar.
export function resolverTipoColumnaDetallado(
  nombre: string,
  valores: unknown[],
  correcciones?: CorreccionesDeTipo
): TipoColumnaDetallado {
  const corregido = correcciones && Object.prototype.hasOwnProperty.call(correcciones, nombre) ? correcciones[nombre] : undefined;
  if (corregido !== undefined && motivoDeTipoNoAplicable(corregido, valores) === null) {
    return corregido;
  }
  return inferirTipoColumnaDetallado(valores);
}

export function resolverTipoColumna(nombre: string, valores: unknown[], correcciones?: CorreccionesDeTipo): TipoColumna {
  return MAPEO_A_TIPO_LEGADO[resolverTipoColumnaDetallado(nombre, valores, correcciones)];
}
