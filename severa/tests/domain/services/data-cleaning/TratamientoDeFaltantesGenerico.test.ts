import {
  DecisionDeTratamiento,
  ESTRATEGIAS_DE_FALTANTES,
  METODOS_DE_IMPUTACION,
  aplicarTratamientoDeFaltantes,
  proponerTratamientoDeFaltantes
} from '../../../../src/domain/services/data-cleaning/TratamientoDeFaltantesGenerico';
import { TratamientoDeFaltantesInvalidoError } from '../../../../src/domain/errors/TratamientoDeFaltantesInvalidoError';

// M-15, Ronda 2.
//   RF-120: "el sistema propone al analista una estrategia para cada variable
//           con valores faltantes: eliminar registros, eliminar la variable o
//           imputar. El sistema nunca aplica una estrategia sin confirmación
//           explícita del analista."
//   RF-121: "imputación por media o mediana para variables numéricas y por
//           moda para variables categóricas."

function filasDe(columnas: Record<string, unknown[]>): Array<Record<string, unknown>> {
  const nombres = Object.keys(columnas);
  const largo = columnas[nombres[0]].length;
  return Array.from({ length: largo }, (_, i) => Object.fromEntries(nombres.map((nombre) => [nombre, columnas[nombre][i]])));
}

function proponer(columnas: Record<string, unknown[]>, correcciones?: Parameters<typeof proponerTratamientoDeFaltantes>[2]) {
  return proponerTratamientoDeFaltantes(Object.keys(columnas), filasDe(columnas), correcciones);
}

function aplicar(
  columnas: Record<string, unknown[]>,
  decisiones: DecisionDeTratamiento[],
  correcciones?: Parameters<typeof aplicarTratamientoDeFaltantes>[3]
) {
  return aplicarTratamientoDeFaltantes(Object.keys(columnas), filasDe(columnas), decisiones, correcciones);
}

function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

// 10 edades con 2 faltantes (20%), sin atípicos. Media de las 8 presentes: 30.
const EDAD = [20, 25, 30, 35, 40, 22, 38, 30, null, ''];
const CIUDAD = ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', null, 'Lima', 'Cusco'];

describe('RF-120 — la propuesta por variable', () => {
  test('solo aparecen las variables que tienen faltantes, en el orden del archivo', () => {
    const propuestas = proponer({ id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ciudad: CIUDAD, edad: EDAD });

    expect(propuestas.map((propuesta) => propuesta.columna)).toEqual(['ciudad', 'edad']);
    expect(propuestas[0]).toMatchObject({ valoresFaltantes: 1, porcentajeFaltante: 10 });
    expect(propuestas[1]).toMatchObject({ valoresFaltantes: 2, porcentajeFaltante: 20 });
  });

  test('un dataset completo no tiene nada que proponer', () => {
    expect(proponer({ a: [1, 2, 3], b: ['x', 'y', 'z'] })).toEqual([]);
  });

  test('cuentan como faltantes las celdas vacías y los marcadores NA, N/A, NULL, "-" y "?"', () => {
    const [propuesta] = proponer({ ciudad: ['Lima', 'NA', 'n/a', 'NULL', '-', '?', '  ', null, undefined, 'Lima', 'Cusco', 'Lima'] });

    expect(propuesta.valoresFaltantes).toBe(8);
  });

  test('las tres estrategias del requisito están siempre a la vista, cada una con si está disponible', () => {
    const [propuesta] = proponer({ edad: EDAD });

    expect(propuesta.opciones.map((opcion) => opcion.estrategia)).toEqual(['eliminar_registros', 'eliminar_columna', 'imputar']);
    expect(ESTRATEGIAS_DE_FALTANTES).toEqual(['eliminar_registros', 'eliminar_columna', 'imputar']);
  });
});

describe('RF-121 — qué método de imputación se ofrece según el tipo', () => {
  test('numérica: media o mediana, nunca moda', () => {
    const [propuesta] = proponer({ edad: EDAD });

    expect(propuesta.tipo).toBe('numerica_discreta');
    expect(propuesta.opciones[2]).toEqual({ estrategia: 'imputar', disponible: true, metodos: ['media', 'mediana'] });
  });

  test('categórica (nominal, ordinal o binaria): solo moda', () => {
    const [nominal] = proponer({ ciudad: CIUDAD });
    const [binaria] = proponer({ activo: ['si', 'no', 'si', 'si', 'no', 'si', 'no', null, 'si', 'si'] });

    expect(nominal.opciones[2]).toEqual({ estrategia: 'imputar', disponible: true, metodos: ['moda'] });
    expect(binaria.tipo).toBe('binaria');
    expect(binaria.opciones[2].metodos).toEqual(['moda']);
  });

  test('texto libre, identificador y fechas: no se pueden imputar, y dice por qué', () => {
    const [fecha] = proponer({ alta: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', null] });

    expect(fecha.tipo).toBe('fecha');
    expect(fecha.opciones[2]).toEqual({
      estrategia: 'imputar',
      disponible: false,
      metodos: [],
      motivoNoDisponible:
        'La imputación disponible es media o mediana para variables numéricas y moda para categóricas; esta variable es de tipo fecha.'
    });
  });

  test('los únicos métodos que existen son los tres que autoriza RF-121', () => {
    expect(METODOS_DE_IMPUTACION).toEqual(['media', 'mediana', 'moda']);
  });

  test('una numérica con muchos "NA" se detecta como texto: no se imputa sola, pero se le avisa al analista cómo habilitarlo', () => {
    // 7 números y 3 "NA": 70% numérico, por debajo del 80% que exige la detección.
    const edad = [20, 25, 30, 35, 40, 22, 38, 'NA', 'NA', 'NA'];

    const [sinCorregir] = proponer({ edad });
    expect(sinCorregir.tipo).toBe('texto_libre');
    expect(sinCorregir.opciones[2].disponible).toBe(false);
    expect(sinCorregir.opciones[2].motivoNoDisponible).toMatch(
      /Sin contar los faltantes, sus valores parecen de tipo numérica discreta: si es así, corregí el tipo de la variable y vas a poder imputarla\.$/
    );

    // RF-111: con el tipo corregido, la imputación queda disponible.
    const [corregida] = proponer({ edad }, { edad: 'numerica_discreta' });
    expect(corregida.tipo).toBe('numerica_discreta');
    expect(corregida.opciones[2]).toEqual({ estrategia: 'imputar', disponible: true, metodos: ['media', 'mediana'] });
  });

  test('RF-111: un código numérico marcado como categórico se imputa por moda, no por media', () => {
    const sede = [1, 2, 3, 1, 2, 3, 1, 2, 1, null];

    expect(proponer({ sede })[0].opciones[2].metodos).toEqual(['media', 'mediana']);
    expect(proponer({ sede }, { sede: 'categorica_nominal' })[0].opciones[2].metodos).toEqual(['moda']);
  });
});

describe('RF-120 — la recomendación y su motivo', () => {
  test('pocos faltantes (hasta 5%): eliminar los registros', () => {
    const edad = [...Array.from({ length: 19 }, (_, i) => 20 + i), null];

    const [propuesta] = proponer({ edad });

    expect(propuesta.porcentajeFaltante).toBe(5);
    expect(propuesta.recomendacion.estrategia).toBe('eliminar_registros');
    expect(propuesta.recomendacion.motivo).toMatch(/Faltan pocos valores \(1 de 20 \(5%\)\)/);
  });

  test('numérica sin atípicos: imputar por media', () => {
    const [propuesta] = proponer({ edad: EDAD });

    expect(propuesta.recomendacion).toMatchObject({ estrategia: 'imputar', metodo: 'media' });
    expect(propuesta.recomendacion.motivo).toMatch(/Faltan 2 de 10 \(20%\)/);
    expect(propuesta.recomendacion.motivo).toMatch(/no tiene valores atípicos/);
  });

  test('numérica con atípicos: imputar por mediana, que no se deja arrastrar', () => {
    const ingreso = [1000, 1100, 1200, 1300, 1150, 1250, 1050, 250000, null, null];

    const [propuesta] = proponer({ ingreso });

    expect(propuesta.recomendacion).toMatchObject({ estrategia: 'imputar', metodo: 'mediana' });
    expect(propuesta.recomendacion.motivo).toMatch(/tiene valores atípicos, que arrastran a la media/);
  });

  test('categórica: imputar por moda', () => {
    const ciudad = ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', null, null, 'Cusco'];

    expect(proponer({ ciudad })[0].recomendacion).toMatchObject({ estrategia: 'imputar', metodo: 'moda' });
  });

  test('más de la mitad faltante: eliminar la variable', () => {
    const edad = [20, 25, 30, 35, null, null, null, null, null, null];

    const [propuesta] = proponer({ edad });

    expect(propuesta.recomendacion.estrategia).toBe('eliminar_columna');
    expect(propuesta.recomendacion.motivo).toMatch(/Falta más de la mitad de los valores \(6 de 10 \(60%\)\)/);
  });

  test('exactamente la mitad todavía no se recomienda eliminar', () => {
    const edad = [20, 25, 30, 35, 28, null, null, null, null, null];

    expect(proponer({ edad })[0].recomendacion.estrategia).toBe('imputar');
  });

  test('columna sin ningún valor: eliminarla, y la imputación no está disponible', () => {
    const [propuesta] = proponer({ edad: [20, 25, 30], notas: [null, '', 'NA'] });

    expect(propuesta.columna).toBe('notas');
    expect(propuesta.recomendacion).toEqual({
      estrategia: 'eliminar_columna',
      motivo: 'La columna no tiene ningún valor: no aporta información al análisis.'
    });
    expect(propuesta.opciones[2].disponible).toBe(false);
  });

  test('tipo no imputable con bastantes faltantes: se recomienda NO tratarla', () => {
    const alta = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07', '2024-01-08', null, null];

    const [propuesta] = proponer({ alta });

    expect(propuesta.recomendacion.estrategia).toBe('no_tratar');
    expect(propuesta.recomendacion.metodo).toBeUndefined();
    expect(propuesta.recomendacion.motivo).toMatch(/conviene dejarla como está/);
  });

  test('la recomendación es solo eso: las demás opciones disponibles siguen estando', () => {
    const [propuesta] = proponer({ edad: EDAD });

    expect(propuesta.recomendacion.estrategia).toBe('imputar');
    expect(propuesta.opciones.filter((opcion) => opcion.disponible).map((opcion) => opcion.estrategia)).toEqual([
      'eliminar_registros',
      'eliminar_columna',
      'imputar'
    ]);
  });
});

describe('RF-120/121 — aplicar las decisiones del analista', () => {
  test('imputar por media: solo cambian las celdas faltantes, con la media de las presentes', () => {
    const resultado = aplicar({ edad: EDAD, ciudad: CIUDAD }, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }]);

    expect(resultado.filas.map((fila) => fila.edad)).toEqual([20, 25, 30, 35, 40, 22, 38, 30, 30, 30]);
    // La otra columna queda exactamente como estaba, faltante incluido.
    expect(resultado.filas.map((fila) => fila.ciudad)).toEqual(CIUDAD);
    expect(resultado.operaciones).toEqual([{ operacion: 'imputar', variable: 'edad', registrosAfectados: 2, metodo: 'media', valorImputado: 30 }]);
    expect(resultado).toMatchObject({ filasAntes: 10, filasDespues: 10, filasEliminadas: 0, columnasEliminadas: [], celdasImputadas: 2 });
  });

  test('imputar por mediana', () => {
    const resultado = aplicar({ ingreso: [1000, 1100, 1200, 1300, 250000, null] }, [{ columna: 'ingreso', estrategia: 'imputar', metodo: 'mediana' }]);

    expect(resultado.filas[5].ingreso).toBe(1200);
    expect(resultado.operaciones[0]).toMatchObject({ metodo: 'mediana', valorImputado: 1200, registrosAfectados: 1 });
  });

  test('imputar por moda: la categoría más frecuente', () => {
    const resultado = aplicar({ ciudad: CIUDAD }, [{ columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }]);

    expect(resultado.filas[7].ciudad).toBe('Lima');
    expect(resultado.operaciones[0]).toMatchObject({ operacion: 'imputar', metodo: 'moda', valorImputado: 'Lima', registrosAfectados: 1 });
    expect(resultado.operaciones[0].nota).toBeUndefined();
  });

  test('moda con empate: se elige la primera en orden alfabético y se avisa', () => {
    // Lima 3, Cusco 3, Arequipa 1.
    const resultado = aplicar({ ciudad: ['Lima', 'Cusco', 'Lima', 'Cusco', 'Arequipa', 'Lima', 'Cusco', null] }, [
      { columna: 'ciudad', estrategia: 'imputar', metodo: 'moda' }
    ]);

    expect(resultado.filas[7].ciudad).toBe('Cusco');
    expect(resultado.operaciones[0].nota).toBe(
      'Hay 2 categorías empatadas como más frecuentes (Cusco, Lima); se usó la primera en orden alfabético.'
    );
  });

  test('la moda de una categórica numérica se imputa como número, no como texto', () => {
    const resultado = aplicar({ sede: [1, 2, 3, 1, 2, 3, 1, 2, 1, null] }, [{ columna: 'sede', estrategia: 'imputar', metodo: 'moda' }], {
      sede: 'categorica_nominal'
    });

    expect(resultado.filas[9].sede).toBe(1);
  });

  test('si la media de una variable de enteros no es entera, se imputa tal cual y se avisa (no se redondea)', () => {
    const resultado = aplicar({ hijos: [0, 1, 2, 2, null] }, [{ columna: 'hijos', estrategia: 'imputar', metodo: 'media' }]);

    expect(resultado.filas[4].hijos).toBe(1.25);
    expect(resultado.operaciones[0].nota).toBe(
      'La media (1.25) no es un número entero y la variable solo tenía valores enteros: después de imputar deja de ser una variable discreta.'
    );
  });

  test('eliminar registros: se van las filas con el valor faltante, completas', () => {
    const resultado = aplicar({ edad: EDAD, ciudad: CIUDAD }, [{ columna: 'edad', estrategia: 'eliminar_registros' }]);

    expect(resultado.filas).toHaveLength(8);
    expect(resultado.filas.every((fila) => typeof fila.edad === 'number')).toBe(true);
    expect(resultado.operaciones).toEqual([
      { operacion: 'eliminar_registros', variable: 'edad', registrosAfectados: 2, metodo: 'eliminación de filas con el valor faltante' }
    ]);
    expect(resultado).toMatchObject({ filasAntes: 10, filasDespues: 8, filasEliminadas: 2 });
  });

  test('una fila con faltantes en dos variables se cuenta una sola vez: la suma de la bitácora da las filas eliminadas', () => {
    const resultado = aplicar(
      { a: [1, null, null, 4, 5], b: ['x', null, 'z', null, 'w'] },
      [
        { columna: 'a', estrategia: 'eliminar_registros' },
        { columna: 'b', estrategia: 'eliminar_registros' }
      ]
    );

    expect(resultado.filas).toEqual([
      { a: 1, b: 'x' },
      { a: 5, b: 'w' }
    ]);
    expect(resultado.operaciones.map((operacion) => [operacion.variable, operacion.registrosAfectados])).toEqual([
      ['a', 2],
      ['b', 1]
    ]);
    expect(resultado.filasEliminadas).toBe(3);
  });

  test('eliminar la variable: desaparece de las columnas y de todas las filas', () => {
    const resultado = aplicar({ edad: EDAD, ciudad: CIUDAD }, [{ columna: 'edad', estrategia: 'eliminar_columna' }]);

    expect(resultado.columnas).toEqual(['ciudad']);
    expect(resultado.filas).toHaveLength(10);
    expect(resultado.filas.every((fila) => !('edad' in fila))).toBe(true);
    expect(resultado.columnasEliminadas).toEqual(['edad']);
    expect(resultado.operaciones).toEqual([
      { operacion: 'eliminar_columna', variable: 'edad', registrosAfectados: 2, metodo: 'eliminación de la columna' }
    ]);
  });

  test('las variables sin decisión no se tocan: sus faltantes siguen ahí', () => {
    const resultado = aplicar({ edad: EDAD, ciudad: CIUDAD }, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }]);

    expect(resultado.filas[7].ciudad).toBeNull();
  });

  test('un valor presente que no calza con el tipo ("abc" en una numérica) no es un faltante: no se modifica', () => {
    const resultado = aplicar({ edad: [20, 30, 40, 50, 60, 20, 30, 40, 50, 'abc', null] }, [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }]);

    expect(resultado.filas[9].edad).toBe('abc');
    // La media se calcula solo con los números: (20+30+40+50+60+20+30+40+50)/9
    expect(resultado.filas[10].edad).toBeCloseTo(340 / 9, 10);
    expect(resultado.operaciones[0].registrosAfectados).toBe(1);
  });
});

describe('RF-120/121 — orden de aplicación', () => {
  const columnas = { edad: [10, 20, 30, null, 1000], ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', null] };

  test('primero se eliminan filas y después se imputa: el valor imputado no usa filas descartadas', () => {
    // La fila del 1000 se va por tener la ciudad faltante: la media es (10+20+30)/3.
    const resultado = aplicar(columnas, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ]);

    expect(resultado.filas).toEqual([
      { edad: 10, ciudad: 'Lima' },
      { edad: 20, ciudad: 'Lima' },
      { edad: 30, ciudad: 'Cusco' },
      { edad: 20, ciudad: 'Lima' }
    ]);
    // La bitácora sale en el orden en que se aplicó, no en el que se pidió.
    expect(resultado.operaciones.map((operacion) => operacion.operacion)).toEqual(['eliminar_registros', 'imputar']);
  });

  test('el resultado es el mismo sea cual sea el orden en que se manden las decisiones', () => {
    const decisiones: DecisionDeTratamiento[] = [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ];

    const directo = aplicar(columnas, decisiones);
    const invertido = aplicar(columnas, [...decisiones].reverse());

    expect(invertido.filas).toEqual(directo.filas);
    expect(invertido.columnas).toEqual(directo.columnas);
  });

  test('una imputación que se queda sin celdas que tratar (sus filas ya se eliminaron) se informa con 0 registros', () => {
    const resultado = aplicar({ edad: [10, 20, null], ciudad: ['Lima', 'Cusco', null] }, [
      { columna: 'ciudad', estrategia: 'eliminar_registros' },
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' }
    ]);

    expect(resultado.operaciones[1]).toMatchObject({ operacion: 'imputar', variable: 'edad', registrosAfectados: 0 });
    expect(resultado.celdasImputadas).toBe(0);
  });
});

// RF-137: "el sistema no sobrescribe el dataset original bajo ninguna
// circunstancia".
describe('RF-137 — no modifica los datos que recibe', () => {
  test('con las filas y columnas congeladas no falla, y devuelve objetos nuevos', () => {
    const columnas = congelar(['edad', 'ciudad', 'notas']);
    const filas = congelar(filasDe({ edad: EDAD, ciudad: CIUDAD, notas: EDAD.map(() => null) }));
    const copia = JSON.parse(JSON.stringify(filas));

    const resultado = aplicarTratamientoDeFaltantes(columnas, filas, [
      { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' },
      { columna: 'notas', estrategia: 'eliminar_columna' }
    ]);

    expect(JSON.parse(JSON.stringify(filas))).toEqual(copia);
    expect(columnas).toEqual(['edad', 'ciudad', 'notas']);
    expect(resultado.columnas).not.toBe(columnas);
    resultado.filas.forEach((fila) => {
      expect(filas).not.toContain(fila);
    });
  });
});

describe('RF-120/121 — decisiones que no se pueden aplicar', () => {
  const columnas = { edad: EDAD, ciudad: CIUDAD, id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };

  function esperarRechazo(decisiones: DecisionDeTratamiento[], mensaje: RegExp | string, datos: Record<string, unknown[]> = columnas): void {
    let error: unknown;
    try {
      aplicar(datos, decisiones);
    } catch (capturado) {
      error = capturado;
    }
    expect(error).toBeInstanceOf(TratamientoDeFaltantesInvalidoError);
    expect((error as Error).message).toMatch(mensaje);
  }

  test('ninguna decisión', () => {
    esperarRechazo([], 'No se indicó ninguna decisión de tratamiento.');
  });

  test('una columna que no existe', () => {
    esperarRechazo([{ columna: 'peso', estrategia: 'eliminar_columna' }], 'La columna "peso" no existe en este dataset.');
  });

  test('dos decisiones para la misma columna', () => {
    esperarRechazo(
      [
        { columna: 'edad', estrategia: 'eliminar_registros' },
        { columna: 'edad', estrategia: 'imputar', metodo: 'media' }
      ],
      'Hay más de una decisión para la columna "edad".'
    );
  });

  test('una estrategia que no existe', () => {
    esperarRechazo([{ columna: 'edad', estrategia: 'interpolar' as never }], /Estrategia no válida para "edad"/);
  });

  test('una columna que no tiene faltantes', () => {
    esperarRechazo([{ columna: 'id', estrategia: 'eliminar_columna' }], 'La columna "id" no tiene valores faltantes que tratar.');
  });

  test('imputar sin decir con qué método', () => {
    esperarRechazo([{ columna: 'edad', estrategia: 'imputar' }], 'Para imputar "edad" (numérica discreta) el método debe ser media o mediana.');
  });

  test('moda en una numérica, o media en una categórica', () => {
    esperarRechazo([{ columna: 'edad', estrategia: 'imputar', metodo: 'moda' }], 'el método debe ser media o mediana');
    esperarRechazo([{ columna: 'ciudad', estrategia: 'imputar', metodo: 'media' }], 'Para imputar "ciudad" (categórica nominal) el método debe ser moda.');
  });

  test('un método que no es ninguno de los tres autorizados', () => {
    esperarRechazo([{ columna: 'edad', estrategia: 'imputar', metodo: 'knn' as never }], 'el método debe ser media o mediana');
  });

  test('un método en una estrategia que no es imputar', () => {
    esperarRechazo([{ columna: 'edad', estrategia: 'eliminar_registros', metodo: 'media' }], 'El método solo se indica al imputar (columna "edad").');
  });

  test('imputar una variable de un tipo que no se puede imputar', () => {
    esperarRechazo(
      [{ columna: 'alta', estrategia: 'imputar', metodo: 'moda' }],
      'La columna "alta" es de tipo fecha: solo se pueden imputar variables numéricas (media o mediana) y categóricas (moda).',
      { alta: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', null] }
    );
  });

  test('una limpieza que dejaría el dataset sin filas', () => {
    esperarRechazo(
      [
        { columna: 'a', estrategia: 'eliminar_registros' },
        { columna: 'b', estrategia: 'eliminar_registros' }
      ],
      'Con estas decisiones se eliminarían todas las filas del dataset.',
      { a: [1, null], b: [null, 'x'] }
    );
  });

  test('una limpieza que dejaría el dataset sin columnas', () => {
    esperarRechazo(
      [
        { columna: 'a', estrategia: 'eliminar_columna' },
        { columna: 'b', estrategia: 'eliminar_columna' }
      ],
      'Con estas decisiones se eliminarían todas las columnas del dataset.',
      { a: [1, null], b: [null, 'x'] }
    );
  });

  test('si una decisión es inválida no se aplica ninguna (todo o nada)', () => {
    const filas = filasDe(columnas);
    const copia = JSON.parse(JSON.stringify(filas));

    expect(() =>
      aplicarTratamientoDeFaltantes(Object.keys(columnas), filas, [
        { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
        { columna: 'peso', estrategia: 'eliminar_columna' }
      ])
    ).toThrow(TratamientoDeFaltantesInvalidoError);
    expect(filas).toEqual(copia);
  });
});
