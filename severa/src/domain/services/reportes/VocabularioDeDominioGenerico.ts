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
    unidadPlural: 'encuestados'
  },
  {
    dominio: 'comercial',
    palabrasClave: ['cliente', 'venta', 'producto', 'pedido', 'factura'],
    unidadSingular: 'cliente',
    unidadPlural: 'clientes'
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
function tokenizarNombreColumna(nombreColumna: string): string[] {
  return normalizarTexto(nombreColumna)
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

  return { dominio: mejor.dominio, unidadSingular: mejor.unidadSingular, unidadPlural: mejor.unidadPlural };
}
