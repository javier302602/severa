import {
  CorreccionesDeTipo,
  TipoColumnaDetallado,
  esNumerico,
  esVacio,
  normalizarTexto,
  resolverTipoColumnaDetallado
} from './DetectorDeTipoDeColumna';
import { tokenizarNombreDeColumna } from './NombresDeColumna';
import { calcularCorrelacionPearson, ParXY } from '../descriptive-statistics/Correlacion';

// RF-110 (M-14, Ronda 2): sugerir qué variable(s) podrían ser el "objetivo"
// de un análisis.
//
// Es una SUGERENCIA editable. Este módulo solo ordena candidatas y explica
// por qué las propone; quien decide es el analista (ver
// DecisionVariableObjetivo en DatasetGenerico.ts — el sistema nunca la marca
// como confirmada por su cuenta). Tampoco hace nada con la variable elegida:
// seleccionar predictoras, el tipo de problema y cualquier método de
// predicción son M-16, que sigue bloqueado.
//
// Las señales son las que nombra el propio requisito ("variables binarias,
// variables de resultado o variables con baja cardinalidad y alta relación
// con otras"), cada una con un peso. Los pesos no salen de ninguna teoría:
// expresan qué señal se considera más fuerte, están a la vista como
// constantes y cada candidata lleva escritos sus motivos, para que el
// analista vea por qué aparece y no tenga que creerle a un número.
const PESO_BINARIA = 3;
const PESO_NOMBRE_DE_RESULTADO = 3;
const PESO_BAJA_CARDINALIDAD = 2;
const PESO_RELACION_CON_OTRA = 2;
const PESO_ULTIMA_COLUMNA = 1;

// Una categórica con a lo sumo esta cantidad de valores distintos cuenta
// como "baja cardinalidad".
const MAXIMO_DE_CATEGORIAS = 10;
// |r| de Pearson a partir del cual se dice que dos variables numéricas tienen
// una relación lineal fuerte — el mismo umbral que ya usa la interpretación
// de la matriz de correlación del informe.
const CORRELACION_FUERTE = 0.7;
const MINIMO_DE_PARES_PARA_CORRELACION = 5;
// Una candidata tiene que juntar al menos esto para proponerse: una señal
// fuerte, o dos débiles.
const PUNTAJE_MINIMO = 3;
const MAXIMO_DE_CANDIDATAS = 3;
// Con más de la mitad de los valores ausentes, una columna no es un objetivo
// razonable de nada.
const MAXIMO_PORCENTAJE_FALTANTE = 50;

// Palabras que, en el nombre de una columna, suelen nombrar un resultado.
// Lista corta y ampliable, en español e inglés; se compara por palabra
// completa del nombre (ver tokenizarNombreDeColumna), nunca por fragmento.
const PALABRAS_DE_RESULTADO = new Set(
  [
    'resultado',
    'objetivo',
    'target',
    'label',
    'etiqueta',
    'clase',
    'class',
    'outcome',
    'respuesta',
    'aprobado',
    'aprobo',
    'desaprobado',
    'diagnostico',
    'abandono',
    'churn',
    'fraude',
    'moroso',
    'default',
    'riesgo',
    'calificacion',
    'nota',
    'puntaje',
    'score',
    'rendimiento',
    'satisfaccion',
    'sobrevivio',
    'survived',
    'exito',
    'gano'
  ].map(normalizarTexto)
);

export interface CandidataAVariableObjetivo {
  columna: string;
  tipo: TipoColumnaDetallado;
  puntaje: number;
  motivos: string[];
}

export interface SugerenciaDeVariableObjetivo {
  candidatas: CandidataAVariableObjetivo[];
  // Explica el resultado cuando no hay candidatas, o cómo leerlas si las hay.
  nota: string;
}

function aNumero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

interface ColumnaPerfilada {
  nombre: string;
  tipo: TipoColumnaDetallado;
  valores: unknown[];
  noVacios: unknown[];
  distintos: number;
}

interface Relacion {
  con: string;
  r: number;
}

// La otra columna numérica con la que más se relaciona linealmente, si la
// relación llega al umbral.
function relacionMasFuerte(columna: ColumnaPerfilada, numericas: ColumnaPerfilada[]): Relacion | null {
  let mejor: Relacion | null = null;

  for (const otra of numericas) {
    if (otra.nombre === columna.nombre) continue;

    const pares: ParXY[] = [];
    columna.valores.forEach((valor, indice) => {
      const otro = otra.valores[indice];
      if (!esVacio(valor) && !esVacio(otro) && esNumerico(valor) && esNumerico(otro)) {
        pares.push({ x: aNumero(valor), y: aNumero(otro) });
      }
    });
    if (pares.length < MINIMO_DE_PARES_PARA_CORRELACION) continue;

    const r = calcularCorrelacionPearson(pares);
    if (Math.abs(r) >= CORRELACION_FUERTE && (mejor === null || Math.abs(r) > Math.abs(mejor.r))) {
      mejor = { con: otra.nombre, r };
    }
  }

  return mejor;
}

// Tipos que no pueden ser variable objetivo: un identificador o un texto
// libre no tienen una distribución que explicar, y una fecha es un eje, no un
// resultado.
const TIPOS_NO_APTOS: readonly TipoColumnaDetallado[] = ['identificador', 'texto_libre', 'fecha', 'fecha_hora'];

// Columnas que el analista puede elegir como variable objetivo a mano: todas
// menos las que no pueden serlo por su tipo.
export function esAptaComoVariableObjetivo(tipo: TipoColumnaDetallado): boolean {
  return !TIPOS_NO_APTOS.includes(tipo);
}

export function sugerirVariablesObjetivo(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  correcciones?: CorreccionesDeTipo
): SugerenciaDeVariableObjetivo {
  const perfiladas: ColumnaPerfilada[] = columnas.map((nombre) => {
    const valores = filas.map((fila) => fila[nombre]);
    const noVacios = valores.filter((valor) => !esVacio(valor));
    return {
      nombre,
      tipo: resolverTipoColumnaDetallado(nombre, valores, correcciones),
      valores,
      noVacios,
      distintos: new Set(noVacios.map((valor) => normalizarTexto(String(valor)))).size
    };
  });

  const numericas = perfiladas.filter((columna) => columna.tipo === 'numerica_continua' || columna.tipo === 'numerica_discreta');
  const ultimaColumna = columnas[columnas.length - 1];

  const candidatas: CandidataAVariableObjetivo[] = [];

  perfiladas.forEach((columna) => {
    // Además del tipo: una columna sin variación (o casi vacía) no tiene nada
    // que distinguir.
    if (!esAptaComoVariableObjetivo(columna.tipo)) return;
    if (columna.distintos < 2) return;
    const porcentajeFaltante = filas.length === 0 ? 100 : ((filas.length - columna.noVacios.length) / filas.length) * 100;
    if (porcentajeFaltante > MAXIMO_PORCENTAJE_FALTANTE) return;

    let puntaje = 0;
    const motivos: string[] = [];

    const esNumerica = columna.tipo === 'numerica_continua' || columna.tipo === 'numerica_discreta';

    if (columna.tipo === 'binaria') {
      puntaje += PESO_BINARIA;
      motivos.push('Es una variable binaria (dos valores posibles).');
    } else if (esNumerica && columna.distintos === 2) {
      // Un resultado codificado como 0/1 se detecta como numérico (RF-107),
      // pero para esta pregunta es tan binario como un "sí"/"no".
      puntaje += PESO_BINARIA;
      const [a, b] = [...new Set(columna.noVacios.map((valor) => String(valor).trim()))].sort((x, y) => Number(x) - Number(y));
      motivos.push(`Toma solo dos valores (${a} y ${b}), como una variable binaria.`);
    } else if ((columna.tipo === 'categorica_nominal' || columna.tipo === 'categorica_ordinal') && columna.distintos <= MAXIMO_DE_CATEGORIAS) {
      puntaje += PESO_BAJA_CARDINALIDAD;
      motivos.push(`Tiene pocas categorías (${columna.distintos}).`);
    }

    const palabra = tokenizarNombreDeColumna(columna.nombre).find((token) => PALABRAS_DE_RESULTADO.has(token));
    if (palabra) {
      puntaje += PESO_NOMBRE_DE_RESULTADO;
      motivos.push(`Su nombre sugiere un resultado («${palabra}»).`);
    }

    if (esNumerica) {
      const relacion = relacionMasFuerte(columna, numericas);
      if (relacion) {
        puntaje += PESO_RELACION_CON_OTRA;
        motivos.push(`Tiene una relación lineal fuerte con «${relacion.con}» (r = ${relacion.r.toFixed(2)}).`);
      }
    }

    // Convención habitual de los datasets de análisis: el resultado va al
    // final. Sola no alcanza (ver PUNTAJE_MINIMO); refuerza otra señal.
    if (columna.nombre === ultimaColumna && puntaje > 0) {
      puntaje += PESO_ULTIMA_COLUMNA;
      motivos.push('Es la última columna del archivo, donde suele ubicarse la variable de resultado.');
    }

    if (puntaje >= PUNTAJE_MINIMO) {
      candidatas.push({ columna: columna.nombre, tipo: columna.tipo, puntaje, motivos });
    }
  });

  // Mayor puntaje primero; a igual puntaje, la que está más a la derecha en
  // el archivo (misma convención de arriba). El orden queda determinado por
  // los datos, sin depender del orden de evaluación.
  candidatas.sort((a, b) => b.puntaje - a.puntaje || columnas.indexOf(b.columna) - columnas.indexOf(a.columna));
  const elegidas = candidatas.slice(0, MAXIMO_DE_CANDIDATAS);

  return {
    candidatas: elegidas,
    nota:
      elegidas.length === 0
        ? 'Ninguna columna reúne señales suficientes para proponerla como variable objetivo. Podés elegir una a mano si tu análisis tiene una.'
        : 'Son sugerencias a partir de la forma y el nombre de las columnas: el sistema no conoce el propósito de tu análisis. Podés confirmar una, elegir otra columna o descartarlas.'
  };
}
