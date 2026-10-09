import {
  CorreccionesDeTipo,
  ETIQUETA_DE_TIPO_DETALLADO,
  TipoColumnaDetallado,
  esNumerico,
  inferirTipoColumnaDetallado,
  resolverTipoColumnaDetallado
} from '../variable-detection/DetectorDeTipoDeColumna';
import { esValorFaltante } from './CalidadDeDatosGenerico';
import { calcularCuartiles, calcularMedia, calcularMediana } from '../descriptive-statistics/EstadisticaDescriptiva';
import { TratamientoDeFaltantesInvalidoError } from '../../errors/TratamientoDeFaltantesInvalidoError';

// M-15, Ronda 2 — RF-120 (estrategia de tratamiento) y RF-121 (imputación).
//
// Tres reglas que este archivo garantiza por construcción:
//
//  1. NO DECIDE. proponerTratamientoDeFaltantes arma, para cada variable con
//     faltantes, las opciones posibles y una recomendación con su motivo.
//     Nada se aplica hasta que alguien llama a aplicarTratamientoDeFaltantes
//     con decisiones explícitas — y eso solo ocurre con la confirmación del
//     analista (ver AplicarLimpiezaDeDataset.ts).
//
//  2. NO INVENTA MÉTODOS. La imputación es media o mediana para variables
//     numéricas y moda para categóricas, que es exactamente lo que autoriza
//     RF-121. No hay regresión, vecinos cercanos ni nada "más avanzado".
//
//  3. NO TOCA EL ORIGINAL (RF-137). aplicarTratamientoDeFaltantes es una
//     función pura: devuelve filas y columnas NUEVAS y deja intactas las que
//     recibió (hay un test que le pasa los datos congelados).
//
// "Faltante" es lo que define esValorFaltante (RF-113): celda vacía o un
// marcador como NA, N/A, NULL, "-" o "?". Un valor presente pero que no calza
// con el tipo de la columna ("abc" en una columna numérica) NO es un
// faltante: es un valor inconsistente, se informa en el diagnóstico de
// calidad y este tratamiento no lo modifica.
export type EstrategiaDeFaltantes = 'eliminar_registros' | 'eliminar_columna' | 'imputar';
export type MetodoDeImputacion = 'media' | 'mediana' | 'moda';

export const ESTRATEGIAS_DE_FALTANTES: readonly EstrategiaDeFaltantes[] = ['eliminar_registros', 'eliminar_columna', 'imputar'];
export const METODOS_DE_IMPUTACION: readonly MetodoDeImputacion[] = ['media', 'mediana', 'moda'];

export interface OpcionDeTratamiento {
  estrategia: EstrategiaDeFaltantes;
  disponible: boolean;
  // Solo para 'imputar': con qué métodos.
  metodos: MetodoDeImputacion[];
  motivoNoDisponible?: string;
}

// 'no_tratar' es una recomendación posible ("dejala como está"), no una
// estrategia que se aplique: equivale a no incluir ninguna decisión para esa
// variable.
export interface RecomendacionDeTratamiento {
  estrategia: EstrategiaDeFaltantes | 'no_tratar';
  metodo?: MetodoDeImputacion;
  motivo: string;
}

export interface PropuestaDeTratamiento {
  columna: string;
  tipo: TipoColumnaDetallado;
  valoresFaltantes: number;
  porcentajeFaltante: number;
  opciones: OpcionDeTratamiento[];
  recomendacion: RecomendacionDeTratamiento;
}

// Umbrales de la RECOMENDACIÓN (no de lo que se permite: el analista puede
// elegir cualquier opción disponible). Son criterios orientativos de uso
// corriente, no reglas estadísticas, y por eso el motivo de cada
// recomendación dice el porcentaje real y qué se gana o se pierde.
const PORCENTAJE_POCOS_FALTANTES = 5;
const PORCENTAJE_DEMASIADOS_FALTANTES = 50;
// Mismo multiplicador de Tukey que usa la detección de atípicos (RF-119).
const MULTIPLICADOR_IQR = 1.5;

type FamiliaDeTipo = 'numerica' | 'categorica' | 'otra';

function familiaDe(tipo: TipoColumnaDetallado): FamiliaDeTipo {
  if (tipo === 'numerica_continua' || tipo === 'numerica_discreta') return 'numerica';
  if (tipo === 'categorica_nominal' || tipo === 'categorica_ordinal' || tipo === 'binaria') return 'categorica';
  return 'otra';
}

function aNumero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(String(valor).trim());
}

function numerosValidos(valores: unknown[]): number[] {
  return valores.filter((valor) => !esValorFaltante(valor) && esNumerico(valor)).map(aNumero);
}

function tieneValoresAtipicos(numeros: number[]): boolean {
  if (numeros.length < 4) return false;
  const { q1, q3 } = calcularCuartiles(numeros);
  const margen = MULTIPLICADOR_IQR * (q3 - q1);
  return numeros.some((numero) => numero < q1 - margen || numero > q3 + margen);
}

function porcentajeLegible(porcentaje: number): string {
  return `${Number(porcentaje.toFixed(1))}%`;
}

// Los marcadores de faltante ("NA", "?") cuentan como valores al detectar el
// tipo (ver esValorFaltante), así que una columna numérica con muchos "NA"
// queda detectada como texto — y son justamente esas las que más interesa
// imputar. Este módulo no le cambia el tipo por su cuenta (se vería un tipo
// acá y otro en el resto del sistema): si los valores presentes, solos, sí
// serían numéricos o categóricos, se lo dice al analista para que corrija el
// tipo (RF-111) y pueda imputar.
function pistaDeTipo(presentes: unknown[]): string {
  if (presentes.length === 0) return '';
  const tipoSinFaltantes = inferirTipoColumnaDetallado(presentes);
  if (familiaDe(tipoSinFaltantes) === 'otra') return '';
  return ` Sin contar los faltantes, sus valores parecen de tipo ${ETIQUETA_DE_TIPO_DETALLADO[tipoSinFaltantes]}: si es así, corregí el tipo de la variable y vas a poder imputarla.`;
}

function opcionesPara(
  familia: FamiliaDeTipo,
  tipo: TipoColumnaDetallado,
  hayValoresParaImputar: boolean,
  presentes: unknown[]
): OpcionDeTratamiento[] {
  let imputar: OpcionDeTratamiento;
  if (familia === 'otra') {
    imputar = {
      estrategia: 'imputar',
      disponible: false,
      metodos: [],
      motivoNoDisponible: `La imputación disponible es media o mediana para variables numéricas y moda para categóricas; esta variable es de tipo ${ETIQUETA_DE_TIPO_DETALLADO[tipo]}.${pistaDeTipo(presentes)}`
    };
  } else if (!hayValoresParaImputar) {
    imputar = {
      estrategia: 'imputar',
      disponible: false,
      metodos: [],
      motivoNoDisponible: 'No hay ningún valor presente a partir del cual calcular un reemplazo.'
    };
  } else {
    imputar = { estrategia: 'imputar', disponible: true, metodos: familia === 'numerica' ? ['media', 'mediana'] : ['moda'] };
  }

  return [
    { estrategia: 'eliminar_registros', disponible: true, metodos: [] },
    { estrategia: 'eliminar_columna', disponible: true, metodos: [] },
    imputar
  ];
}

function recomendar(
  familia: FamiliaDeTipo,
  tipo: TipoColumnaDetallado,
  faltantes: number,
  totalFilas: number,
  valoresPresentes: unknown[]
): RecomendacionDeTratamiento {
  const porcentaje = (faltantes / totalFilas) * 100;
  const cuanto = `${faltantes} de ${totalFilas} (${porcentajeLegible(porcentaje)})`;

  if (faltantes === totalFilas) {
    return { estrategia: 'eliminar_columna', motivo: 'La columna no tiene ningún valor: no aporta información al análisis.' };
  }

  if (porcentaje > PORCENTAJE_DEMASIADOS_FALTANTES) {
    return {
      estrategia: 'eliminar_columna',
      motivo: `Falta más de la mitad de los valores (${cuanto}). Imputarlos haría que la mayor parte de la columna fuese calculada en vez de observada, y eliminar las filas perdería más de la mitad del dataset.`
    };
  }

  if (familia === 'otra') {
    // Texto libre, identificadores y fechas no entran en los cálculos
    // estadísticos de la misma forma: borrar filas por ellas suele costar más
    // de lo que aporta.
    if (porcentaje <= PORCENTAJE_POCOS_FALTANTES) {
      return {
        estrategia: 'eliminar_registros',
        motivo: `Faltan pocos valores (${cuanto}) y este tipo de variable (${ETIQUETA_DE_TIPO_DETALLADO[tipo]}) no se puede imputar con media, mediana ni moda. Eliminar esas filas cuesta poco.`
      };
    }
    return {
      estrategia: 'no_tratar',
      motivo: `Faltan ${cuanto} y este tipo de variable (${ETIQUETA_DE_TIPO_DETALLADO[tipo]}) no se puede imputar con media, mediana ni moda. Eliminar esas filas perdería los datos de las demás columnas; si la variable no es central para tu análisis, conviene dejarla como está.`
    };
  }

  if (porcentaje <= PORCENTAJE_POCOS_FALTANTES) {
    return {
      estrategia: 'eliminar_registros',
      motivo: `Faltan pocos valores (${cuanto}): eliminar esas filas casi no reduce el dataset y evita introducir valores calculados.`
    };
  }

  if (familia === 'numerica') {
    const numeros = numerosValidos(valoresPresentes);
    if (tieneValoresAtipicos(numeros)) {
      return {
        estrategia: 'imputar',
        metodo: 'mediana',
        motivo: `Faltan ${cuanto}: eliminar las filas perdería una parte apreciable del dataset. La variable tiene valores atípicos, que arrastran a la media; la mediana no se ve afectada por ellos.`
      };
    }
    return {
      estrategia: 'imputar',
      metodo: 'media',
      motivo: `Faltan ${cuanto}: eliminar las filas perdería una parte apreciable del dataset. La variable no tiene valores atípicos, así que la media la representa bien.`
    };
  }

  return {
    estrategia: 'imputar',
    metodo: 'moda',
    motivo: `Faltan ${cuanto}: eliminar las filas perdería una parte apreciable del dataset. En una variable categórica el reemplazo disponible es la moda (la categoría más frecuente).`
  };
}

// RF-120: una propuesta por cada variable que tiene valores faltantes, en el
// orden de las columnas del dataset. Las variables completas no aparecen.
export function proponerTratamientoDeFaltantes(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  correcciones?: CorreccionesDeTipo
): PropuestaDeTratamiento[] {
  const propuestas: PropuestaDeTratamiento[] = [];

  columnas.forEach((columna) => {
    const valores = filas.map((fila) => fila[columna]);
    const presentes = valores.filter((valor) => !esValorFaltante(valor));
    const faltantes = valores.length - presentes.length;
    if (faltantes === 0) return;

    const tipo = resolverTipoColumnaDetallado(columna, valores, correcciones);
    const familia = familiaDe(tipo);
    const hayValoresParaImputar = familia === 'numerica' ? numerosValidos(presentes).length > 0 : presentes.length > 0;

    propuestas.push({
      columna,
      tipo,
      valoresFaltantes: faltantes,
      porcentajeFaltante: (faltantes / valores.length) * 100,
      opciones: opcionesPara(familia, tipo, hayValoresParaImputar, presentes),
      recomendacion: recomendar(familia, tipo, faltantes, valores.length, presentes)
    });
  });

  return propuestas;
}

export interface DecisionDeTratamiento {
  columna: string;
  estrategia: EstrategiaDeFaltantes;
  // Obligatorio (y solo válido) cuando la estrategia es 'imputar'.
  metodo?: MetodoDeImputacion;
}

// Lo que efectivamente se hizo, una entrada por decisión, en el orden en que
// se aplicó. Es el insumo de la bitácora (RF-123) y del resumen (RF-122).
export interface OperacionDeLimpiezaAplicada {
  operacion: EstrategiaDeFaltantes;
  variable: string;
  // eliminar_registros: filas eliminadas por los faltantes de ESTA variable
  //   (una fila con faltantes en dos variables se cuenta en la primera).
  // eliminar_columna: valores faltantes que tenía la columna eliminada.
  // imputar: celdas que recibieron el valor de reemplazo.
  registrosAfectados: number;
  metodo: string;
  // Solo para 'imputar'.
  valorImputado?: number | string | boolean;
  // Aclaración cuando hay algo que el analista debe saber (moda con empate).
  nota?: string;
}

export interface ResultadoDeTratamiento {
  columnas: string[];
  filas: Array<Record<string, unknown>>;
  operaciones: OperacionDeLimpiezaAplicada[];
  filasAntes: number;
  filasDespues: number;
  filasEliminadas: number;
  columnasEliminadas: string[];
  celdasImputadas: number;
}

function validarDecisiones(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  decisiones: DecisionDeTratamiento[],
  correcciones?: CorreccionesDeTipo
): void {
  if (decisiones.length === 0) {
    throw new TratamientoDeFaltantesInvalidoError('No se indicó ninguna decisión de tratamiento.');
  }

  const vistas = new Set<string>();
  decisiones.forEach((decision) => {
    if (!columnas.includes(decision.columna)) {
      throw new TratamientoDeFaltantesInvalidoError(`La columna "${decision.columna}" no existe en este dataset.`);
    }
    if (vistas.has(decision.columna)) {
      throw new TratamientoDeFaltantesInvalidoError(`Hay más de una decisión para la columna "${decision.columna}".`);
    }
    vistas.add(decision.columna);

    if (!ESTRATEGIAS_DE_FALTANTES.includes(decision.estrategia)) {
      throw new TratamientoDeFaltantesInvalidoError(
        `Estrategia no válida para "${decision.columna}": debe ser eliminar_registros, eliminar_columna o imputar.`
      );
    }

    const valores = filas.map((fila) => fila[decision.columna]);
    if (!valores.some(esValorFaltante)) {
      throw new TratamientoDeFaltantesInvalidoError(`La columna "${decision.columna}" no tiene valores faltantes que tratar.`);
    }

    if (decision.estrategia !== 'imputar') {
      if (decision.metodo !== undefined) {
        throw new TratamientoDeFaltantesInvalidoError(`El método solo se indica al imputar (columna "${decision.columna}").`);
      }
      return;
    }

    const tipo = resolverTipoColumnaDetallado(decision.columna, valores, correcciones);
    const familia = familiaDe(tipo);
    if (familia === 'otra') {
      throw new TratamientoDeFaltantesInvalidoError(
        `La columna "${decision.columna}" es de tipo ${ETIQUETA_DE_TIPO_DETALLADO[tipo]}: solo se pueden imputar variables numéricas (media o mediana) y categóricas (moda).`
      );
    }
    const permitidos: MetodoDeImputacion[] = familia === 'numerica' ? ['media', 'mediana'] : ['moda'];
    if (decision.metodo === undefined || !permitidos.includes(decision.metodo)) {
      throw new TratamientoDeFaltantesInvalidoError(
        `Para imputar "${decision.columna}" (${ETIQUETA_DE_TIPO_DETALLADO[tipo]}) el método debe ser ${permitidos.join(' o ')}.`
      );
    }
  });
}

// La categoría más frecuente. Si varias empatan se elige la primera en orden
// alfabético: un criterio fijo, que no depende del orden de las filas, y que
// queda informado en la nota de la operación para que el analista sepa que
// hubo que desempatar.
function calcularModa(presentes: unknown[]): { valor: unknown; empatadas: string[] } {
  const conteo = new Map<string, { cantidad: number; valorCrudo: unknown }>();
  presentes.forEach((valor) => {
    const clave = String(valor).trim();
    const actual = conteo.get(clave);
    if (actual) {
      actual.cantidad += 1;
    } else {
      // Se conserva el valor tal como está en los datos (un número sigue
      // siendo número, no su texto).
      conteo.set(clave, { cantidad: 1, valorCrudo: typeof valor === 'string' ? clave : valor });
    }
  });

  let maximo = 0;
  conteo.forEach(({ cantidad }) => {
    if (cantidad > maximo) maximo = cantidad;
  });
  const empatadas = [...conteo.entries()]
    .filter(([, { cantidad }]) => cantidad === maximo)
    .map(([clave]) => clave)
    .sort((a, b) => a.localeCompare(b, 'es'));

  return { valor: (conteo.get(empatadas[0]) as { valorCrudo: unknown }).valorCrudo, empatadas };
}

// RF-120/121: aplica las decisiones del analista y devuelve el dataset
// resultante. Orden fijo, sea cual sea el orden de las decisiones:
//   1. se quitan las columnas a eliminar;
//   2. se quitan las filas con faltantes en las variables marcadas para eso;
//   3. se imputa, calculando media/mediana/moda sobre las filas que quedaron.
// Así el valor imputado nunca se calcula con filas que el propio analista
// decidió descartar.
export function aplicarTratamientoDeFaltantes(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  decisiones: DecisionDeTratamiento[],
  correcciones?: CorreccionesDeTipo
): ResultadoDeTratamiento {
  validarDecisiones(columnas, filas, decisiones, correcciones);

  const operaciones: OperacionDeLimpiezaAplicada[] = [];

  // 1. Columnas.
  const aEliminar = decisiones.filter((decision) => decision.estrategia === 'eliminar_columna').map((decision) => decision.columna);
  aEliminar.forEach((columna) => {
    operaciones.push({
      operacion: 'eliminar_columna',
      variable: columna,
      registrosAfectados: filas.filter((fila) => esValorFaltante(fila[columna])).length,
      metodo: 'eliminación de la columna'
    });
  });
  const columnasResultantes = columnas.filter((columna) => !aEliminar.includes(columna));
  if (columnasResultantes.length === 0) {
    throw new TratamientoDeFaltantesInvalidoError('Con estas decisiones se eliminarían todas las columnas del dataset.');
  }

  // 2. Filas. Cada fila eliminada se atribuye a la primera variable (en el
  // orden de las decisiones) que la descarta, para que la suma de la bitácora
  // coincida con las filas realmente eliminadas.
  const porRegistros = decisiones.filter((decision) => decision.estrategia === 'eliminar_registros').map((decision) => decision.columna);
  const eliminadasPor = new Map<string, number>(porRegistros.map((columna) => [columna, 0]));
  const filasConservadas = filas.filter((fila) => {
    const culpable = porRegistros.find((columna) => esValorFaltante(fila[columna]));
    if (culpable === undefined) return true;
    eliminadasPor.set(culpable, (eliminadasPor.get(culpable) as number) + 1);
    return false;
  });
  porRegistros.forEach((columna) => {
    operaciones.push({
      operacion: 'eliminar_registros',
      variable: columna,
      registrosAfectados: eliminadasPor.get(columna) as number,
      metodo: 'eliminación de filas con el valor faltante'
    });
  });

  if (filasConservadas.length === 0) {
    throw new TratamientoDeFaltantesInvalidoError(
      'Con estas decisiones se eliminarían todas las filas del dataset. Revisá las variables marcadas para eliminar registros.'
    );
  }

  // 3. Imputación, sobre lo que quedó.
  const reemplazos = new Map<string, unknown>();
  decisiones
    .filter((decision) => decision.estrategia === 'imputar')
    .forEach((decision) => {
      const valores = filasConservadas.map((fila) => fila[decision.columna]);
      const presentes = valores.filter((valor) => !esValorFaltante(valor));
      const celdas = valores.length - presentes.length;

      let valorImputado: unknown;
      let nota: string | undefined;
      if (decision.metodo === 'moda') {
        if (presentes.length === 0) {
          throw new TratamientoDeFaltantesInvalidoError(`No hay ningún valor en "${decision.columna}" a partir del cual calcular la moda.`);
        }
        const moda = calcularModa(presentes);
        valorImputado = moda.valor;
        if (moda.empatadas.length > 1) {
          nota = `Hay ${moda.empatadas.length} categorías empatadas como más frecuentes (${moda.empatadas.join(', ')}); se usó la primera en orden alfabético.`;
        }
      } else {
        const numeros = numerosValidos(presentes);
        if (numeros.length === 0) {
          throw new TratamientoDeFaltantesInvalidoError(
            `No hay ningún valor numérico en "${decision.columna}" a partir del cual calcular la ${decision.metodo}.`
          );
        }
        valorImputado = decision.metodo === 'media' ? calcularMedia(numeros) : calcularMediana(numeros);
        // El valor se usa tal cual se calculó: redondearlo sería aplicar un
        // método que nadie pidió. Pero si la variable solo tenía enteros, el
        // analista tiene que saber que ahora tiene un valor que no lo es.
        if (!Number.isInteger(valorImputado as number) && numeros.every((numero) => Number.isInteger(numero))) {
          nota = `La ${decision.metodo} (${valorImputado as number}) no es un número entero y la variable solo tenía valores enteros: después de imputar deja de ser una variable discreta.`;
        }
      }

      reemplazos.set(decision.columna, valorImputado);
      operaciones.push({
        operacion: 'imputar',
        variable: decision.columna,
        registrosAfectados: celdas,
        metodo: decision.metodo as MetodoDeImputacion,
        valorImputado: valorImputado as number | string | boolean,
        nota
      });
    });

  // Filas nuevas: nunca se escribe sobre los objetos recibidos.
  const filasResultantes = filasConservadas.map((fila) => {
    const nueva: Record<string, unknown> = {};
    columnasResultantes.forEach((columna) => {
      const valor = fila[columna];
      nueva[columna] = reemplazos.has(columna) && esValorFaltante(valor) ? reemplazos.get(columna) : valor;
    });
    return nueva;
  });

  return {
    columnas: columnasResultantes,
    filas: filasResultantes,
    operaciones,
    filasAntes: filas.length,
    filasDespues: filasResultantes.length,
    filasEliminadas: filas.length - filasResultantes.length,
    columnasEliminadas: aEliminar,
    celdasImputadas: operaciones.filter((operacion) => operacion.operacion === 'imputar').reduce((suma, operacion) => suma + operacion.registrosAfectados, 0)
  };
}
