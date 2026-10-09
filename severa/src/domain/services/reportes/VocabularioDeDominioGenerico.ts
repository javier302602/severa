import { normalizarTexto } from '../variable-detection/DetectorDeTipoDeColumna';

// RF-134 (M-10 Ronda 2, Pasada 1): heurística simple de diccionario, mismo
// espíritu que DetectorDeTipoDeColumna.ts (mayoría/coincidencia de palabras
// clave, nunca inferencia semántica real) — NO es NLP, no hay similaridad
// difusa ni embeddings. Deliberadamente chico y extensible: agregar un
// dominio nuevo es agregar una entrada a DOMINIOS, no lógica nueva.
//
// Alcance real (decisión confirmada en la auditoría de esta pasada): el
// vocabulario derivado sustituye SOLO la palabra que nombra "una fila de
// este dataset" (unidadSingular/unidadPlural) — no reescribe fórmulas,
// encabezados de tabla ni títulos de sección, que son etiquetas
// estructurales, no narrativa generada. Sin concordancia de género
// gramatical: los llamadores deben evitar pegar un adjetivo directo a
// unidadSingular/unidadPlural (ver InterpretadorDeResultadosGenerico.ts,
// que reformula sus oraciones para no necesitarla) — agregar un campo de
// género sería una complejidad real que no se justifica para esta pasada.
export interface VocabularioDataset {
  dominio: string;
  unidadSingular: string;
  unidadPlural: string;
}

export const VOCABULARIO_NEUTRO: VocabularioDataset = {
  dominio: 'neutro',
  unidadSingular: 'fila',
  unidadPlural: 'filas'
};

interface DefinicionDominio {
  dominio: string;
  // Escritas tal cual se leerían (con tildes) — se normalizan una vez al
  // cargar el módulo (ver DOMINIOS más abajo), igual que los nombres de
  // columna, así que no hace falta escribir variantes sin acento a mano.
  // Se comparan por TOKEN EXACTO contra los nombres de columna (partidos
  // por caracteres no alfabéticos), no por substring crudo: "especie"
  // matchea la columna "nombre_especie" (token "especie") pero NO matchea
  // "reclientelizacion" solo por contener "cliente" como substring.
  palabrasClave: string[];
  unidadSingular: string;
  unidadPlural: string;
  // Opcional: afina la unidad DENTRO del dominio ya detectado, según qué
  // palabras clave aparecieron. Sin esto, `unidadSingular`/`unidadPlural`
  // valen para cualquier dataset del dominio. Ver elegirUnidad más abajo.
  unidadSegunEvidencia?: (tokens: Set<string>) => Unidad | null;
}

interface Unidad {
  unidadSingular: string;
  unidadPlural: string;
}

// Bug real: el dominio comercial llamaba "cliente" a cada fila sin importar
// qué palabra lo había disparado. Una tabla de ventas con las columnas
// Producto/Precio/Cantidad/FechaVenta salía en el informe como "un dataset de
// 30 clientes" y "1 duplicado(s) exacto(s) de clientes" — afirmaciones falsas
// sobre los datos del usuario. Detectar el DOMINIO por palabras clave es
// razonable; decidir QUÉ ES cada fila necesita más cuidado: una columna
// "cliente" aparece tanto en un padrón de clientes como en un registro de
// ventas a clientes. La unidad se elige por la evidencia más específica y,
// si no alcanza, se usa una palabra que es verdad para cualquier tabla del
// dominio ("registro", "persona") en vez de adivinar.
function unidadComercial(tokens: Set<string>): Unidad | null {
  // Una columna que nombra una transacción manda: si hay "venta", cada fila
  // es una venta aunque también haya columnas de cliente y producto.
  const transacciones: Array<[string, Unidad]> = [
    ['venta', { unidadSingular: 'venta', unidadPlural: 'ventas' }],
    ['pedido', { unidadSingular: 'pedido', unidadPlural: 'pedidos' }],
    ['factura', { unidadSingular: 'factura', unidadPlural: 'facturas' }]
  ];
  const presentes = transacciones.filter(([palabra]) => tokens.has(palabra));
  if (presentes.length === 1) return presentes[0][1];
  if (presentes.length > 1) return { unidadSingular: 'transacción', unidadPlural: 'transacciones' };

  // Sin transacción: un padrón. Solo si nombra UNA entidad — con cliente y
  // producto a la vez no se puede saber cuál de las dos es la fila.
  const hayCliente = tokens.has('cliente');
  const hayProducto = tokens.has('producto');
  if (hayCliente && !hayProducto) return { unidadSingular: 'cliente', unidadPlural: 'clientes' };
  if (hayProducto && !hayCliente) return { unidadSingular: 'producto', unidadPlural: 'productos' };
  return null;
}

// "edad", "género" y "ocupación" describen personas en cualquier contexto
// (pacientes, empleados, estudiantes): solo una palabra propia de encuestas
// justifica llamar "encuestado" a cada fila.
function unidadCienciasSociales(tokens: Set<string>): Unidad | null {
  const esEncuesta = ['encuestado', 'encuesta', 'respuesta'].some((palabra) => tokens.has(palabra));
  return esEncuesta ? null : { unidadSingular: 'persona', unidadPlural: 'personas' };
}

const DOMINIOS_SIN_NORMALIZAR: DefinicionDominio[] = [
  {
    dominio: 'biologia',
    palabrasClave: ['especie', 'muestra', 'espécimen', 'organismo', 'individuo'],
    unidadSingular: 'espécimen',
    unidadPlural: 'especímenes'
  },
  {
    dominio: 'cienciasSociales',
    palabrasClave: ['encuestado', 'encuesta', 'respuesta', 'edad', 'género', 'ocupación'],
    unidadSingular: 'encuestado',
    unidadPlural: 'encuestados',
    unidadSegunEvidencia: unidadCienciasSociales
  },
  {
    dominio: 'comercial',
    palabrasClave: ['cliente', 'venta', 'producto', 'pedido', 'factura'],
    // Unidad cuando la evidencia no alcanza para decir qué es cada fila.
    unidadSingular: 'registro',
    unidadPlural: 'registros',
    unidadSegunEvidencia: unidadComercial
  }
];

// Normalizado una sola vez al cargar el módulo — evita normalizar las
// mismas 20 palabras clave en cada llamada a detectarVocabularioDataset.
const DOMINIOS: DefinicionDominio[] = DOMINIOS_SIN_NORMALIZAR.map((definicion) => ({
  ...definicion,
  palabrasClave: definicion.palabrasClave.map(normalizarTexto)
}));

// normalizarTexto ya deja "ñ" como "n" (NFD decompone la tilde combinable y
// RANGO_DIACRITICOS_COMBINABLES la elimina, igual que con cualquier acento)
// — el separador de tokens no necesita conocer "ñ" como caso especial.
//
// Antes de normalizar (que pasa todo a minúsculas) se separan las palabras
// pegadas por mayúsculas: "FechaVenta" y "idCliente" son dos tokens cada una,
// igual que "fecha_venta" e "id_cliente". Sin esto, un Excel con encabezados
// en PascalCase — lo más común — no aportaba ninguna de sus palabras, y
// "FechaVenta" no contaba como evidencia de que la tabla es de ventas.
function tokenizarNombreColumna(nombreColumna: string): string[] {
  const conPalabrasSeparadas = nombreColumna
    .replace(/(\p{Ll}|\d)(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2');
  return normalizarTexto(conPalabrasSeparadas)
    .split(/[^a-z]+/)
    .filter((token) => token.length > 0);
}

// Gana el dominio con ESTRICTAMENTE más coincidencias que cualquier otro —
// un empate (incluida la ausencia total de coincidencias) cae al default
// neutro en vez de adivinar entre dos dominios con la misma evidencia,
// mismo criterio conservador que el resto del proyecto usa para no inventar
// una respuesta cuando los datos no la respaldan con claridad.
export function detectarVocabularioDataset(nombresColumnas: string[]): VocabularioDataset {
  const tokens = new Set(nombresColumnas.flatMap(tokenizarNombreColumna));

  let mejor: DefinicionDominio | null = null;
  let mejorConteo = 0;
  let hayEmpate = false;

  for (const definicion of DOMINIOS) {
    const conteo = definicion.palabrasClave.filter((palabra) => tokens.has(palabra)).length;
    if (conteo === 0) continue;
    if (conteo > mejorConteo) {
      mejor = definicion;
      mejorConteo = conteo;
      hayEmpate = false;
    } else if (conteo === mejorConteo) {
      hayEmpate = true;
    }
  }

  if (mejor === null || hayEmpate) {
    return VOCABULARIO_NEUTRO;
  }

  const unidad = mejor.unidadSegunEvidencia?.(tokens) ?? mejor;
  return { dominio: mejor.dominio, unidadSingular: unidad.unidadSingular, unidadPlural: unidad.unidadPlural };
}
