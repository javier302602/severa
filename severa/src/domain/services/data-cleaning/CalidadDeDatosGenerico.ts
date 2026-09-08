import {
  TipoColumna,
  TipoColumnaDetallado,
  esVacio,
  esNumerico,
  calzaConTipo,
  inferirTipoColumna,
  inferirTipoColumnaDetallado,
  normalizarTexto,
  PATRON_FECHA_ISO,
  PATRON_FECHA_DIA_MES_ANIO
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

// M-15 (RF-113): marcadores de texto que un dataset real usa para decir
// "esto falta" sin dejar la celda técnicamente vacía. Deliberadamente
// SEPARADA de esVacio() (DetectorDeTipoDeColumna.ts) — no la reemplaza ni la
// llama por dentro con un alcance más amplio. Motivo (decisión de arquitectura
// revisada y confirmada, no un descuido): esVacio() alimenta la población
// `noVacios` que decide el TIPO de la columna en inferirTipoColumnaDetallado
// (UMBRAL_MAYORIA, UMBRAL_CARDINALIDAD_CATEGORICA, UMBRAL_IDENTIFICADOR).
// Ampliarla ahí cambia el numerador Y el denominador de esos umbrales, no
// solo el conteo de faltantes — ejemplo real: una columna con 7 números y 2
// celdas "NA" en 9 valores hoy NO es numérica (7/9 = 0.778 < 0.8 de mayoría,
// porque "NA" cuenta en el denominador); si esVacio() tratara "NA" como
// vacío, quedarían 7 valores, los 7 numéricos, proporción 7/7 = 1.0, y la
// columna pasaría a ser numérica — un cambio de tipo real para un dataset ya
// existente, no cosmético. esValorFaltante() solo se usa para los campos de
// CALIDAD de este archivo (valoresFaltantes/porcentajeFaltante/valoresUnicos/
// valoresInconsistentes/variabilidad/filas incompletas) — nunca llega a
// inferirTipoColumna()/inferirTipoColumnaDetallado(), que se siguen llamando
// con `valores` crudos sin tocar (ver analizarColumna más abajo y el test de
// propiedad en CalidadDeDatosGenerico.test.ts).
const MARCADORES_DE_FALTANTE = ['na', 'n/a', 'null', '-', '?'];

export function esValorFaltante(valor: unknown): boolean {
  if (esVacio(valor)) return true;
  if (typeof valor !== 'string') return false;
  return MARCADORES_DE_FALTANTE.includes(valor.trim().toLowerCase());
}

// M-15 (RF-115): "vacía" (ningún valor real, ni siquiera un marcador) vs.
// "constante" (un único valor real repetido) vs. "normal". Se deriva de
// valoresUnicos, ya calculado más abajo — sin recorrido adicional. Nunca
// excluye la columna: es una sugerencia para que decida el analista.
export type VariabilidadColumna = 'vacia' | 'constante' | 'normal';

// M-15 (RF-118): fechas en más de un formato dentro de la misma columna.
// esFecha() (DetectorDeTipoDeColumna.ts) acepta ISO y DD/MM/AAAA como
// igualmente válidos para DETECTAR el tipo — nunca distingue cuál usó cada
// celda, así que una columna mezclando ambos formatos hoy pasa calzaConTipo
// sin marcarse inconsistente. Esto lo hace visible, reutilizando los mismos
// patrones (no se reimplementan).
export interface FormatoFechaEncontrado {
  formato: 'iso' | 'dia_mes_anio' | 'date_object';
  cantidad: number;
  ejemplo: string;
}

export interface FormatoFechaInconsistente {
  formatosEncontrados: FormatoFechaEncontrado[];
  normalizacionSugerida: string;
}

// M-15 (RF-118): variantes de mayúsculas/minúsculas (u otras diferencias que
// normalizarTexto() ignora: espacios, diacríticos) de una misma categoría.
// Acotado a columnas categóricas (nunca texto_libre/identificador): ahí la
// variación es una señal real de inconsistencia; en texto libre es ruido
// esperable, reportarla sería una alerta sin valor.
export interface VarianteDeFormatoTexto {
  valorCrudo: string;
  cantidad: number;
}

export interface GrupoFormatoTextoInconsistente {
  formaNormalizada: string;
  variantes: VarianteDeFormatoTexto[];
}

export interface FormatoTextoInconsistente {
  grupos: GrupoFormatoTextoInconsistente[];
}

// Mejora 4 — Fase 2. Diagnóstico de calidad por columna: cuántos valores
// faltan, cuántos "valores únicos" tiene (indicio de cardinalidad) y cuántos
// no calzan con el tipo ya inferido para esa columna (ver comentario de
// UMBRAL_MAYORIA en DetectorDeTipoDeColumna.ts — esos son precisamente la
// minoría de valores que no siguieron la mayoría al clasificar el tipo).
//
// tipoDetallado/esIdentificador/tipoDatoCrudo (M-14, RF-106/107/109) y
// variabilidad/formatoFechaInconsistente/formatoTextoInconsistente (M-15,
// RF-115/118) son opcionales a propósito: cualquier objeto DiagnosticoColumna
// construido a mano en un test existente (no vía analizarColumna()) sigue
// compilando sin tocarlo. El código real (analizarColumna, más abajo) siempre
// completa tipoDetallado/esIdentificador/tipoDatoCrudo/variabilidad; los dos
// campos de formato inconsistente quedan `undefined` cuando no aplica (la
// columna no es del tipo relevante) o no se detectó ninguna mezcla — su sola
// presencia ya es la señal de "hay algo que mirar", sin que el consumidor
// tenga que revisar un array vacío.
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
  variabilidad?: VariabilidadColumna;
  formatoFechaInconsistente?: FormatoFechaInconsistente;
  formatoTextoInconsistente?: FormatoTextoInconsistente;
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
//
// M-15 (RF-116): se mantiene intacta a propósito — sigue siendo la única
// fuente de `DiagnosticoDataset.filasDuplicadas` (embebido en la respuesta de
// POST /analisis-datos/analizar, RF-112, y en DatasetGenerico.filasDuplicadas
// persistido) y siempre compara TODAS las columnas, cero riesgo de
// regresión. El detalle configurable por subconjunto de columnas vive aparte,
// en detectarFilasDuplicadas() (ver más abajo), consumido solo por el nuevo
// endpoint de calidad.
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

// M-15 (RF-116): duplicados por un subconjunto CONFIGURABLE de columnas
// clave (plural), elegible por análisis — sin relación de código con
// `DatasetGenerico.columnaClave` (M-09/pendiente de M-03), que es un campo
// singular, persistido a nivel de dataset, escrito solo para identificar la
// fila de cara a `criterioClasificacion`/priorización y nunca leído por
// ninguna lógica de duplicados. Son conceptos con nombre parecido, cero
// conexión real (confirmado al planear esta ronda). Con columnasClave =
// todas las columnas, el total coincide exactamente con
// contarFilasDuplicadas() — mismo criterio, más detalle (qué filas, no solo
// cuántas).
export interface GrupoFilasDuplicadas {
  valoresClave: Record<string, unknown>;
  indicesFilas: number[];
}

export interface ResultadoFilasDuplicadas {
  columnasClave: string[];
  totalFilasDuplicadas: number;
  grupos: GrupoFilasDuplicadas[];
}

export function detectarFilasDuplicadas(columnasClave: string[], filas: Array<Record<string, unknown>>): ResultadoFilasDuplicadas {
  const indicesPorClave = new Map<string, number[]>();
  filas.forEach((fila, indice) => {
    const clave = JSON.stringify(columnasClave.map((columna) => fila[columna]));
    const indices = indicesPorClave.get(clave);
    if (indices) {
      indices.push(indice);
    } else {
      indicesPorClave.set(clave, [indice]);
    }
  });

  const grupos: GrupoFilasDuplicadas[] = [];
  let totalFilasDuplicadas = 0;
  indicesPorClave.forEach((indices) => {
    if (indices.length > 1) {
      totalFilasDuplicadas += indices.length - 1;
      grupos.push({
        valoresClave: Object.fromEntries(columnasClave.map((columna) => [columna, filas[indices[0]][columna]])),
        indicesFilas: indices
      });
    }
  });

  return { columnasClave, totalFilasDuplicadas, grupos };
}

// M-15 (RF-114): filas cuyo % de campos faltantes (mismo criterio ampliado
// de esValorFaltante — una fila llena de "NA" es tan incompleta como una
// fila con celdas literalmente vacías) supera un umbral elegido por el
// analista. Default 50 si no se especifica (decisión tomada al planear:
// mitad de los campos en blanco es un punto de partida razonable para
// "sospechosa", ajustable en cada llamada).
export interface FilaIncompleta {
  indiceFila: number;
  porcentajeFaltante: number;
}

export interface ResultadoFilasIncompletas {
  umbralPorcentaje: number;
  filasIncompletas: FilaIncompleta[];
}

export function detectarFilasIncompletas(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  umbralPorcentaje = 50
): ResultadoFilasIncompletas {
  if (columnas.length === 0) {
    return { umbralPorcentaje, filasIncompletas: [] };
  }

  const filasIncompletas: FilaIncompleta[] = [];
  filas.forEach((fila, indice) => {
    const cantidadFaltante = columnas.filter((columna) => esValorFaltante(fila[columna])).length;
    const porcentajeFaltante = (cantidadFaltante / columnas.length) * 100;
    if (porcentajeFaltante >= umbralPorcentaje) {
      filasIncompletas.push({ indiceFila: indice, porcentajeFaltante });
    }
  });

  return { umbralPorcentaje, filasIncompletas };
}

// M-15 (RF-117): valores numéricos fuera de un rango configurado por el
// analista — chequeo ADICIONAL a valoresInconsistentes (tipo), no un
// reemplazo: un valor puede ser numérico válido y aun así estar fuera de
// dominio (ej. edad = -5). Solo columnas numéricas esta ronda (fecha queda
// fuera, decisión tomada al planear).
export interface FilaFueraDeRango {
  indiceFila: number;
  valor: number;
}

export interface ResultadoValidacionRango {
  columna: string;
  minimo: number;
  maximo: number;
  cantidadFueraDeRango: number;
  filasFueraDeRango: FilaFueraDeRango[];
}

function aNumeroValido(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

export function validarRango(
  nombreColumna: string,
  filas: Array<Record<string, unknown>>,
  minimo: number,
  maximo: number
): ResultadoValidacionRango {
  const filasFueraDeRango: FilaFueraDeRango[] = [];
  filas.forEach((fila, indice) => {
    const crudo = fila[nombreColumna];
    if (esVacio(crudo) || !esNumerico(crudo)) return;
    const valor = aNumeroValido(crudo);
    if (valor < minimo || valor > maximo) {
      filasFueraDeRango.push({ indiceFila: indice, valor });
    }
  });

  return { columna: nombreColumna, minimo, maximo, cantidadFueraDeRango: filasFueraDeRango.length, filasFueraDeRango };
}

// M-15 (RF-118a): clasifica CADA valor de una columna 'fecha' por cuál de
// los dos formatos aceptados usó, reutilizando los patrones de
// DetectorTipoDeColumna.ts (no se reimplementan). Si aparece más de un
// formato entre los valores no faltantes, la columna queda marcada — nunca
// se normaliza sola.
function clasificarFormatoFecha(valor: unknown): 'iso' | 'dia_mes_anio' | 'date_object' | null {
  if (valor instanceof Date) return 'date_object';
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (PATRON_FECHA_ISO.test(texto)) return 'iso';
  if (PATRON_FECHA_DIA_MES_ANIO.test(texto)) return 'dia_mes_anio';
  return null;
}

function detectarFormatoFechaInconsistente(noFaltantes: unknown[]): FormatoFechaInconsistente | undefined {
  const conteoPorFormato = new Map<'iso' | 'dia_mes_anio' | 'date_object', { cantidad: number; ejemplo: string }>();

  noFaltantes.forEach((valor) => {
    const formato = clasificarFormatoFecha(valor);
    if (!formato) return;
    const actual = conteoPorFormato.get(formato);
    if (actual) {
      actual.cantidad += 1;
    } else {
      conteoPorFormato.set(formato, { cantidad: 1, ejemplo: valor instanceof Date ? valor.toISOString() : String(valor) });
    }
  });

  if (conteoPorFormato.size <= 1) return undefined;

  return {
    formatosEncontrados: [...conteoPorFormato.entries()].map(([formato, { cantidad, ejemplo }]) => ({ formato, cantidad, ejemplo })),
    normalizacionSugerida: 'ISO 8601 (AAAA-MM-DD)'
  };
}

// M-15 (RF-118b): agrupa valores de texto no faltantes por su forma
// normalizada (normalizarTexto: trim + minúsculas + sin diacríticos, la
// misma que usan las escalas ordinales conocidas) y reporta los grupos donde
// aparece más de una variante cruda distinta. Valores no-string (ej. una
// columna binaria numérica 0/1 clasificada como categórica) se ignoran: la
// noción de "mayúsculas/minúsculas" no les aplica.
function detectarFormatoTextoInconsistente(noFaltantes: unknown[]): FormatoTextoInconsistente | undefined {
  const gruposPorNormalizado = new Map<string, Map<string, number>>();

  noFaltantes.forEach((valor) => {
    if (typeof valor !== 'string') return;
    const normalizado = normalizarTexto(valor);
    const variantesDelGrupo = gruposPorNormalizado.get(normalizado) ?? new Map<string, number>();
    variantesDelGrupo.set(valor, (variantesDelGrupo.get(valor) ?? 0) + 1);
    gruposPorNormalizado.set(normalizado, variantesDelGrupo);
  });

  const grupos: GrupoFormatoTextoInconsistente[] = [];
  gruposPorNormalizado.forEach((variantesMap, formaNormalizada) => {
    if (variantesMap.size > 1) {
      grupos.push({
        formaNormalizada,
        variantes: [...variantesMap.entries()].map(([valorCrudo, cantidad]) => ({ valorCrudo, cantidad }))
      });
    }
  });

  return grupos.length > 0 ? { grupos } : undefined;
}

function analizarColumna(nombre: string, valores: unknown[]): DiagnosticoColumna {
  // tipo/tipoDetallado se calculan SIEMPRE sobre `valores` crudos, exactamente
  // como antes de RF-113 — esValorFaltante() (más amplio que esVacio) nunca
  // participa acá. Es la garantía de no regresión del plan, no una promesa:
  // ver el test de propiedad en CalidadDeDatosGenerico.test.ts.
  const tipo = inferirTipoColumna(valores);
  const tipoDetallado = inferirTipoColumnaDetallado(valores);

  const noFaltantes = valores.filter((valor) => !esValorFaltante(valor));
  const faltantes = valores.length - noFaltantes.length;
  const inconsistentes = noFaltantes.filter((valor) => !calzaConTipo(valor, tipo)).length;
  const valoresUnicos = new Set(noFaltantes.map((valor) => String(valor).trim().toLowerCase())).size;

  const variabilidad: VariabilidadColumna = valoresUnicos === 0 ? 'vacia' : valoresUnicos === 1 ? 'constante' : 'normal';

  return {
    nombre,
    tipo,
    tipoDetallado,
    esIdentificador: tipoDetallado === 'identificador',
    tipoDatoCrudo: inferirTipoDatoCrudo(valores),
    valoresFaltantes: faltantes,
    porcentajeFaltante: valores.length === 0 ? 0 : (faltantes / valores.length) * 100,
    valoresUnicos,
    valoresInconsistentes: inconsistentes,
    variabilidad,
    formatoFechaInconsistente: tipo === 'fecha' ? detectarFormatoFechaInconsistente(noFaltantes) : undefined,
    formatoTextoInconsistente: tipo === 'categorica' ? detectarFormatoTextoInconsistente(noFaltantes) : undefined
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
