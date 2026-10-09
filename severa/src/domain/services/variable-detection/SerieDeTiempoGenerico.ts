import {
  CorreccionesDeTipo,
  aFechaGenerica,
  esVacio,
  resolverTipoColumnaDetallado
} from './DetectorDeTipoDeColumna';

// RF-108 (M-14, Ronda 2): ¿este dataset se puede tratar como una serie de
// tiempo?
//
// El requisito pide dos cosas: señalar qué columnas son de fecha o
// fecha-hora, y decir si hay "una frecuencia temporal suficientemente
// regular". Este módulo responde solo eso — describe la estructura temporal
// de los datos. No pronostica nada ni propone ningún método de análisis de
// series: eso es M-16, que sigue bloqueado.
//
// CÓMO SE DECIDE. Para cada columna temporal se prueba, de la más fina a la
// más gruesa, una lista de frecuencias (segundo, minuto, hora, día, semana,
// mes, trimestre, año). En cada una se agrupan las fechas por período y se
// mira la COBERTURA: de todos los períodos que hay entre la primera y la
// última fecha, qué proporción tiene al menos un registro. La frecuencia de
// la serie es la más fina que cumple dos condiciones:
//   - cobertura >= COBERTURA_MINIMA: casi no faltan períodos;
//   - al menos MINIMO_DE_PERIODOS períodos con datos.
// Ejemplos: ventas con fecha el día 1 de cada mes -> por día la cobertura es
// ~1/30 (no), por semana ~1/4 (no), por mes 100% (sí): "mensual". Un registro
// por cada transacción en días sueltos -> ni diaria ni semanal, pero si todos
// los meses tienen alguna: "mensual, agregando".
//
// Los dos umbrales son criterios orientativos de este sistema, no reglas
// estadísticas: están como constantes con nombre para poder ajustarlos, y la
// respuesta siempre muestra los números (períodos, cobertura, faltantes) con
// los que se decidió, para que el analista pueda discrepar.
export const COBERTURA_MINIMA_DE_PERIODOS = 0.8;
export const MINIMO_DE_PERIODOS = 8;

export type FrecuenciaTemporal =
  | 'por_segundo'
  | 'por_minuto'
  | 'horaria'
  | 'diaria'
  // Lunes a viernes: una serie diaria que nunca tiene sábados ni domingos
  // (cotizaciones, asistencia) es regular aunque le "falten" 2 días de cada 7.
  | 'diaria_habil'
  | 'semanal'
  | 'mensual'
  | 'trimestral'
  | 'anual';

export const ETIQUETA_DE_FRECUENCIA: Record<FrecuenciaTemporal, string> = {
  por_segundo: 'por segundo',
  por_minuto: 'por minuto',
  horaria: 'horaria',
  diaria: 'diaria',
  diaria_habil: 'diaria (días hábiles, lunes a viernes)',
  semanal: 'semanal',
  mensual: 'mensual',
  trimestral: 'trimestral',
  anual: 'anual'
};

// 'directa': hay exactamente un registro por período, la columna ya es el eje
// de una serie. 'requiere_agregacion': hay períodos con varios registros
// (transacciones, eventos); para verla como serie hay que resumir cada
// período (contar, sumar, promediar — lo decide el analista).
export type ViabilidadDeSerie = 'directa' | 'requiere_agregacion' | 'no_viable';

export interface EvaluacionDeColumnaTemporal {
  columna: string;
  tipo: 'fecha' | 'fecha_hora';
  valoresValidos: number;
  instantesDistintos: number;
  // Primera y última fecha, en ISO 8601 (UTC). null si no hay ninguna válida.
  desde: string | null;
  hasta: string | null;
  viabilidad: ViabilidadDeSerie;
  // null cuando no se encontró ninguna frecuencia regular.
  frecuencia: FrecuenciaTemporal | null;
  // Los tres números con los que se decidió, para la frecuencia elegida (o,
  // si no hubo ninguna, para la que más se acercó).
  periodosConDatos: number;
  periodosFaltantes: number;
  cobertura: number;
  motivo: string;
}

export interface EvaluacionDeSerieDeTiempo {
  columnasTemporales: EvaluacionDeColumnaTemporal[];
  esViableComoSerieDeTiempo: boolean;
  // La columna temporal más adecuada como eje, si hay alguna viable.
  columnaSugerida: string | null;
  // Columnas numéricas que podrían observarse a lo largo del tiempo.
  variablesNumericas: string[];
  resumen: string;
}

const MS_POR_SEGUNDO = 1000;
const MS_POR_MINUTO = 60 * MS_POR_SEGUNDO;
const MS_POR_HORA = 60 * MS_POR_MINUTO;
const MS_POR_DIA = 24 * MS_POR_HORA;

// El 1 de enero de 1970 (día 0) fue jueves: sumando 3 las semanas quedan
// cortadas de lunes a domingo.
const DESFASE_A_LUNES = 3;

function indiceDeDia(instante: number): number {
  return Math.floor(instante / MS_POR_DIA);
}

interface Granularidad {
  frecuencia: Exclude<FrecuenciaTemporal, 'diaria_habil'>;
  // Solo tiene sentido buscarla si la columna trae hora.
  requiereHora: boolean;
  indiceDePeriodo: (instante: number) => number;
}

// De la más fina a la más gruesa: el orden ES el criterio de elección.
const GRANULARIDADES: Granularidad[] = [
  { frecuencia: 'por_segundo', requiereHora: true, indiceDePeriodo: (t) => Math.floor(t / MS_POR_SEGUNDO) },
  { frecuencia: 'por_minuto', requiereHora: true, indiceDePeriodo: (t) => Math.floor(t / MS_POR_MINUTO) },
  { frecuencia: 'horaria', requiereHora: true, indiceDePeriodo: (t) => Math.floor(t / MS_POR_HORA) },
  { frecuencia: 'diaria', requiereHora: false, indiceDePeriodo: indiceDeDia },
  { frecuencia: 'semanal', requiereHora: false, indiceDePeriodo: (t) => Math.floor((indiceDeDia(t) + DESFASE_A_LUNES) / 7) },
  {
    frecuencia: 'mensual',
    requiereHora: false,
    indiceDePeriodo: (t) => {
      const fecha = new Date(t);
      return fecha.getUTCFullYear() * 12 + fecha.getUTCMonth();
    }
  },
  {
    frecuencia: 'trimestral',
    requiereHora: false,
    indiceDePeriodo: (t) => {
      const fecha = new Date(t);
      return fecha.getUTCFullYear() * 4 + Math.floor(fecha.getUTCMonth() / 3);
    }
  },
  { frecuencia: 'anual', requiereHora: false, indiceDePeriodo: (t) => new Date(t).getUTCFullYear() }
];

interface Medicion {
  frecuencia: FrecuenciaTemporal;
  periodosConDatos: number;
  periodosEsperados: number;
  cobertura: number;
}

function medir(frecuencia: FrecuenciaTemporal, periodos: Set<number>, periodosEsperados: number): Medicion {
  return {
    frecuencia,
    periodosConDatos: periodos.size,
    periodosEsperados,
    cobertura: periodosEsperados === 0 ? 0 : periodos.size / periodosEsperados
  };
}

function esDiaHabil(dia: number): boolean {
  // 0 = lunes ... 6 = domingo, con el mismo desfase que las semanas.
  const diaDeLaSemana = (((dia + DESFASE_A_LUNES) % 7) + 7) % 7;
  return diaDeLaSemana <= 4;
}

function contarDiasHabiles(desde: number, hasta: number): number {
  const semanasCompletas = Math.floor((hasta - desde + 1) / 7);
  let habiles = semanasCompletas * 5;
  for (let dia = desde + semanasCompletas * 7; dia <= hasta; dia += 1) {
    if (esDiaHabil(dia)) habiles += 1;
  }
  return habiles;
}

function medirTodas(instantes: number[], traeHora: boolean): Medicion[] {
  const mediciones: Medicion[] = [];

  for (const granularidad of GRANULARIDADES) {
    if (granularidad.requiereHora && !traeHora) continue;

    const periodos = new Set(instantes.map(granularidad.indiceDePeriodo));
    let minimo = Infinity;
    let maximo = -Infinity;
    periodos.forEach((periodo) => {
      if (periodo < minimo) minimo = periodo;
      if (periodo > maximo) maximo = periodo;
    });
    // Variante de la diaria: si ninguna fecha cae en fin de semana y el rango
    // abarca alguno, los períodos esperados son solo los días hábiles. En ese
    // caso REEMPLAZA a la diaria en vez de sumarse: describe mejor los mismos
    // datos (misma cantidad de períodos, cobertura igual o mayor), y si no se
    // la prefiriera, dos semanas de lunes a viernes saldrían como "diaria con
    // 2 días faltantes" solo porque 10 de 12 ya supera el umbral.
    const diasEsperados = maximo - minimo + 1;
    if (granularidad.frecuencia === 'diaria' && [...periodos].every(esDiaHabil)) {
      const habilesEsperados = contarDiasHabiles(minimo, maximo);
      if (habilesEsperados < diasEsperados) {
        mediciones.push(medir('diaria_habil', periodos, habilesEsperados));
        continue;
      }
    }
    mediciones.push(medir(granularidad.frecuencia, periodos, diasEsperados));
  }

  return mediciones;
}

function cumple(medicion: Medicion): boolean {
  return medicion.periodosConDatos >= MINIMO_DE_PERIODOS && medicion.cobertura >= COBERTURA_MINIMA_DE_PERIODOS;
}

function porcentaje(proporcion: number): string {
  return `${Number((proporcion * 100).toFixed(1))}%`;
}

function evaluarColumna(nombre: string, tipo: 'fecha' | 'fecha_hora', valores: unknown[]): EvaluacionDeColumnaTemporal {
  const instantes = valores
    .filter((valor) => !esVacio(valor))
    .map((valor) => aFechaGenerica(valor).getTime())
    .filter((instante) => !Number.isNaN(instante));

  const base = {
    columna: nombre,
    tipo,
    valoresValidos: instantes.length,
    instantesDistintos: new Set(instantes).size
  };

  if (instantes.length === 0) {
    return {
      ...base,
      desde: null,
      hasta: null,
      viabilidad: 'no_viable',
      frecuencia: null,
      periodosConDatos: 0,
      periodosFaltantes: 0,
      cobertura: 0,
      motivo: 'La columna no tiene ninguna fecha válida.'
    };
  }

  let primero = Infinity;
  let ultimo = -Infinity;
  instantes.forEach((instante) => {
    if (instante < primero) primero = instante;
    if (instante > ultimo) ultimo = instante;
  });
  const rango = { desde: new Date(primero).toISOString(), hasta: new Date(ultimo).toISOString() };

  const mediciones = medirTodas(instantes, tipo === 'fecha_hora');
  const elegida = mediciones.find(cumple);

  if (elegida) {
    const unRegistroPorPeriodo = instantes.length === elegida.periodosConDatos;
    const faltantes = elegida.periodosEsperados - elegida.periodosConDatos;
    const detalleFaltantes = faltantes === 0 ? 'sin períodos faltantes' : `${faltantes} período(s) sin datos`;
    const etiqueta = ETIQUETA_DE_FRECUENCIA[elegida.frecuencia];

    return {
      ...base,
      ...rango,
      viabilidad: unRegistroPorPeriodo ? 'directa' : 'requiere_agregacion',
      frecuencia: elegida.frecuencia,
      periodosConDatos: elegida.periodosConDatos,
      periodosFaltantes: faltantes,
      cobertura: elegida.cobertura,
      motivo: unRegistroPorPeriodo
        ? `Frecuencia ${etiqueta}: ${elegida.periodosConDatos} períodos con exactamente un registro cada uno (cobertura ${porcentaje(elegida.cobertura)}, ${detalleFaltantes}).`
        : `Frecuencia ${etiqueta} si se agrupan los registros por período: ${instantes.length} registros repartidos en ${elegida.periodosConDatos} períodos (cobertura ${porcentaje(elegida.cobertura)}, ${detalleFaltantes}). Hay períodos con más de un registro, así que para verla como serie hay que resumir cada período.`
    };
  }

  // Ninguna frecuencia cumple. Se informa la que más se acercó entre las que
  // tienen períodos suficientes; si ninguna los tiene, el problema es ese.
  const conPeriodosSuficientes = mediciones.filter((medicion) => medicion.periodosConDatos >= MINIMO_DE_PERIODOS);
  if (conPeriodosSuficientes.length === 0) {
    const masFina = mediciones[0];
    return {
      ...base,
      ...rango,
      viabilidad: 'no_viable',
      frecuencia: null,
      periodosConDatos: masFina.periodosConDatos,
      periodosFaltantes: masFina.periodosEsperados - masFina.periodosConDatos,
      cobertura: masFina.cobertura,
      motivo: `Solo hay ${masFina.periodosConDatos} momento(s) distinto(s); se consideran necesarios al menos ${MINIMO_DE_PERIODOS} períodos para hablar de una serie de tiempo.`
    };
  }

  const masCercana = conPeriodosSuficientes.reduce((mejor, medicion) => (medicion.cobertura > mejor.cobertura ? medicion : mejor));
  return {
    ...base,
    ...rango,
    viabilidad: 'no_viable',
    frecuencia: null,
    periodosConDatos: masCercana.periodosConDatos,
    periodosFaltantes: masCercana.periodosEsperados - masCercana.periodosConDatos,
    cobertura: masCercana.cobertura,
    motivo: `Las fechas no siguen una frecuencia regular: la más cercana es la ${ETIQUETA_DE_FRECUENCIA[masCercana.frecuencia]}, donde solo ${masCercana.periodosConDatos} de ${masCercana.periodosEsperados} períodos tienen datos (cobertura ${porcentaje(masCercana.cobertura)}; se considera regular a partir de ${porcentaje(COBERTURA_MINIMA_DE_PERIODOS)}).`
  };
}

const ORDEN_DE_VIABILIDAD: Record<ViabilidadDeSerie, number> = { directa: 0, requiere_agregacion: 1, no_viable: 2 };

export function evaluarSerieDeTiempo(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  correcciones?: CorreccionesDeTipo
): EvaluacionDeSerieDeTiempo {
  const columnasTemporales: EvaluacionDeColumnaTemporal[] = [];
  const variablesNumericas: string[] = [];

  columnas.forEach((nombre) => {
    const valores = filas.map((fila) => fila[nombre]);
    const tipo = resolverTipoColumnaDetallado(nombre, valores, correcciones);
    if (tipo === 'fecha' || tipo === 'fecha_hora') {
      columnasTemporales.push(evaluarColumna(nombre, tipo, valores));
    } else if (tipo === 'numerica_continua' || tipo === 'numerica_discreta') {
      variablesNumericas.push(nombre);
    }
  });

  const viables = columnasTemporales
    .filter((columna) => columna.viabilidad !== 'no_viable')
    .sort(
      (a, b) => ORDEN_DE_VIABILIDAD[a.viabilidad] - ORDEN_DE_VIABILIDAD[b.viabilidad] || b.periodosConDatos - a.periodosConDatos
    );
  const sugerida = viables[0] ?? null;

  let resumen: string;
  if (columnasTemporales.length === 0) {
    resumen = 'El dataset no tiene ninguna columna de fecha o fecha-hora: no se puede tratar como serie de tiempo.';
  } else if (!sugerida) {
    resumen = `Hay ${columnasTemporales.length} columna(s) temporal(es), pero ninguna tiene una frecuencia suficientemente regular para tratar el dataset como serie de tiempo.`;
  } else {
    const etiqueta = ETIQUETA_DE_FRECUENCIA[sugerida.frecuencia as FrecuenciaTemporal];
    resumen =
      sugerida.viabilidad === 'directa'
        ? `Se puede tratar como serie de tiempo ${etiqueta} usando «${sugerida.columna}» como eje temporal.`
        : `Se puede tratar como serie de tiempo ${etiqueta} usando «${sugerida.columna}» como eje temporal, resumiendo antes los registros de cada período.`;
    if (variablesNumericas.length === 0) {
      resumen += ' No hay columnas numéricas para observar en el tiempo: la serie posible es la cantidad de registros por período.';
    }
  }

  return {
    columnasTemporales,
    esViableComoSerieDeTiempo: sugerida !== null,
    columnaSugerida: sugerida?.columna ?? null,
    variablesNumericas,
    resumen
  };
}
