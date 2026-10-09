import {
  esAptaComoVariableObjetivo,
  sugerirVariablesObjetivo
} from '../../../../src/domain/services/variable-detection/VariableObjetivoGenerico';

// RF-110 (M-14, Ronda 2): "el sistema sugiere al analista la(s) variable(s)
// candidatas a ser objetivo del análisis (variables binarias, variables de
// resultado o variables con baja cardinalidad y alta relación con otras)".
// Lo que se prueba acá es la SUGERENCIA. Que el sistema no la fije por su
// cuenta se prueba en DefinirVariableObjetivo.test.ts.

function filasDe(columnas: Record<string, unknown[]>): Array<Record<string, unknown>> {
  const nombres = Object.keys(columnas);
  const largo = columnas[nombres[0]].length;
  return Array.from({ length: largo }, (_, i) => Object.fromEntries(nombres.map((nombre) => [nombre, columnas[nombre][i]])));
}

function sugerir(columnas: Record<string, unknown[]>, correcciones?: Parameters<typeof sugerirVariablesObjetivo>[2]) {
  return sugerirVariablesObjetivo(Object.keys(columnas), filasDe(columnas), correcciones);
}

// 10 filas. `horas` y `gasto` no tienen relación lineal fuerte entre sí.
const HORAS = [2, 9, 4, 7, 1, 8, 3, 6, 5, 10];
const GASTO = [50.5, 20.1, 80.3, 30.7, 60.2, 90.9, 10.4, 70.6, 40.8, 55.5];
const SI_NO = ['si', 'no', 'si', 'si', 'no', 'si', 'no', 'no', 'si', 'si'];
const TURNO = ['mañana', 'tarde', 'noche', 'mañana', 'tarde', 'noche', 'mañana', 'tarde', 'noche', 'mañana'];

describe('RF-110 — señales que vuelven candidata a una columna', () => {
  test('binaria + nombre de resultado + última columna: es la candidata, con sus tres motivos', () => {
    const { candidatas, nota } = sugerir({ horas: HORAS, gasto: GASTO, aprobado: SI_NO });

    expect(candidatas).toEqual([
      {
        columna: 'aprobado',
        tipo: 'binaria',
        puntaje: 7,
        motivos: [
          'Es una variable binaria (dos valores posibles).',
          'Su nombre sugiere un resultado («aprobado»).',
          'Es la última columna del archivo, donde suele ubicarse la variable de resultado.'
        ]
      }
    ]);
    expect(nota).toMatch(/Son sugerencias/);
    expect(nota).toMatch(/el sistema no conoce el propósito de tu análisis/);
  });

  test('una binaria alcanza sola, aunque no esté al final ni tenga nombre de resultado', () => {
    const { candidatas } = sugerir({ fumador: SI_NO, horas: HORAS, gasto: GASTO });

    expect(candidatas.map((candidata) => candidata.columna)).toEqual(['fumador']);
    expect(candidatas[0].puntaje).toBe(3);
  });

  test('un resultado codificado como 0/1 cuenta como binario aunque se detecte como numérico', () => {
    const { candidatas } = sugerir({ sobrevivio: [0, 1, 1, 0, 1, 0, 0, 1, 1, 0], horas: HORAS, gasto: GASTO });

    expect(candidatas).toHaveLength(1);
    expect(candidatas[0]).toMatchObject({ columna: 'sobrevivio', tipo: 'numerica_discreta', puntaje: 6 });
    expect(candidatas[0].motivos).toEqual(['Toma solo dos valores (0 y 1), como una variable binaria.', 'Su nombre sugiere un resultado («sobrevivio»).']);
  });

  test('el nombre se compara por palabra completa: "nota_final" sí, "anotaciones" no', () => {
    expect(sugerir({ nota_final: GASTO, horas: HORAS }).candidatas.map((c) => c.columna)).toEqual(['nota_final']);
    expect(sugerir({ notaFinal: GASTO, horas: HORAS }).candidatas.map((c) => c.columna)).toEqual(['notaFinal']);
    expect(sugerir({ anotaciones: GASTO, horas: HORAS }).candidatas).toEqual([]);
  });

  test('pocas categorías sola no alcanza; al final del archivo, sí', () => {
    expect(sugerir({ turno: TURNO, horas: HORAS, gasto: GASTO }).candidatas).toEqual([]);

    const { candidatas } = sugerir({ horas: HORAS, gasto: GASTO, turno: TURNO });
    expect(candidatas).toHaveLength(1);
    expect(candidatas[0]).toMatchObject({ columna: 'turno', puntaje: 3 });
    expect(candidatas[0].motivos[0]).toBe('Tiene pocas categorías (3).');
  });

  test('relación lineal fuerte con otra variable: sola no alcanza; al final del archivo, sí', () => {
    const doble = HORAS.map((hora) => 2 * hora + 1);

    // En el medio: las dos están relacionadas, ninguna llega al mínimo.
    expect(sugerir({ horas: HORAS, doble, turno_texto: TURNO.map((t, i) => `${t} ${i}`) }).candidatas).toEqual([]);

    const { candidatas } = sugerir({ horas: HORAS, doble });
    expect(candidatas).toHaveLength(1);
    expect(candidatas[0]).toMatchObject({ columna: 'doble', puntaje: 3 });
    expect(candidatas[0].motivos[0]).toBe('Tiene una relación lineal fuerte con «horas» (r = 1.00).');
  });

  test('una relación inversa también cuenta, y se informa con su signo', () => {
    const inversa = HORAS.map((hora) => 100 - 3 * hora);

    const { candidatas } = sugerir({ horas: HORAS, inversa });

    expect(candidatas[0].motivos[0]).toBe('Tiene una relación lineal fuerte con «horas» (r = -1.00).');
  });

  test('estar al final del archivo, sin ninguna otra señal, no vuelve candidata a una columna', () => {
    expect(sugerir({ horas: HORAS, gasto: GASTO }).candidatas).toEqual([]);
  });
});

describe('RF-110 — qué columnas nunca se proponen', () => {
  test('identificadores, texto libre y fechas, aunque el nombre sugiera un resultado', () => {
    const { candidatas } = sugerir({
      horas: HORAS,
      gasto: GASTO,
      resultado_id: HORAS.map((_, i) => `EXP-${1000 + i}`),
      fecha_resultado: HORAS.map((_, i) => `2024-03-${String(i + 1).padStart(2, '0')}`)
    });

    expect(candidatas).toEqual([]);
  });

  test('una columna con un solo valor (no hay nada que distinguir)', () => {
    expect(sugerir({ horas: HORAS, resultado: HORAS.map(() => 'ok') }).candidatas).toEqual([]);
  });

  test('una columna a la que le falta más de la mitad de los valores', () => {
    const casiVacia = ['si', 'no', 'si', 'no', null, null, null, null, null, null];

    expect(sugerir({ horas: HORAS, aprobado: casiVacia }).candidatas).toEqual([]);
    // Con exactamente la mitad todavía se propone.
    expect(sugerir({ horas: HORAS, aprobado: ['si', 'no', 'si', 'no', 'si', null, null, null, null, null] }).candidatas).toHaveLength(1);
  });

  test('un dataset sin filas no tiene candidatas, y la nota lo explica', () => {
    const { candidatas, nota } = sugerirVariablesObjetivo(['a', 'resultado'], []);

    expect(candidatas).toEqual([]);
    expect(nota).toMatch(/Ninguna columna reúne señales suficientes/);
    expect(nota).toMatch(/Podés elegir una a mano/);
  });
});

describe('RF-110 — orden y cantidad', () => {
  test('mayor puntaje primero; a igual puntaje, la que está más a la derecha', () => {
    const { candidatas } = sugerir({
      fumador: SI_NO, // 3
      diabetico: [...SI_NO].reverse(), // 3
      horas: HORAS,
      diagnostico: SI_NO.map((valor) => (valor === 'si' ? 'positivo' : 'negativo')) // 3 + 3 + 1
    });

    expect(candidatas.map((candidata) => [candidata.columna, candidata.puntaje])).toEqual([
      ['diagnostico', 7],
      ['diabetico', 3],
      ['fumador', 3]
    ]);
  });

  test('como mucho tres candidatas', () => {
    const { candidatas } = sugerir({ a: SI_NO, b: SI_NO, c: SI_NO, d: SI_NO, e: SI_NO });

    expect(candidatas).toHaveLength(3);
    expect(candidatas.map((candidata) => candidata.columna)).toEqual(['e', 'd', 'c']);
  });

  test('el resultado no depende del orden de las filas', () => {
    const columnas = { horas: HORAS, gasto: GASTO, aprobado: SI_NO };
    const filas = filasDe(columnas);
    const invertidas = [...filas].reverse();

    expect(sugerirVariablesObjetivo(Object.keys(columnas), invertidas)).toEqual(sugerirVariablesObjetivo(Object.keys(columnas), filas));
  });
});

describe('RF-110 + RF-111 — respeta el tipo corregido por el analista', () => {
  test('un código numérico marcado como categórico pasa a evaluarse como categórica', () => {
    const sede = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1];

    expect(sugerir({ horas: HORAS, gasto: GASTO, sede }).candidatas).toEqual([]);

    const { candidatas } = sugerir({ horas: HORAS, gasto: GASTO, sede }, { sede: 'categorica_nominal' });
    expect(candidatas).toHaveLength(1);
    expect(candidatas[0]).toMatchObject({ columna: 'sede', tipo: 'categorica_nominal' });
  });

  test('una columna marcada a mano como identificador deja de proponerse', () => {
    expect(sugerir({ horas: HORAS, aprobado: SI_NO }, { aprobado: 'identificador' }).candidatas).toEqual([]);
  });
});

describe('RF-110 — qué puede elegir el analista a mano', () => {
  test('cualquier tipo salvo identificador, texto libre y fechas', () => {
    expect(esAptaComoVariableObjetivo('numerica_continua')).toBe(true);
    expect(esAptaComoVariableObjetivo('numerica_discreta')).toBe(true);
    expect(esAptaComoVariableObjetivo('binaria')).toBe(true);
    expect(esAptaComoVariableObjetivo('categorica_nominal')).toBe(true);
    expect(esAptaComoVariableObjetivo('categorica_ordinal')).toBe(true);
    expect(esAptaComoVariableObjetivo('identificador')).toBe(false);
    expect(esAptaComoVariableObjetivo('texto_libre')).toBe(false);
    expect(esAptaComoVariableObjetivo('fecha')).toBe(false);
    expect(esAptaComoVariableObjetivo('fecha_hora')).toBe(false);
  });
});
