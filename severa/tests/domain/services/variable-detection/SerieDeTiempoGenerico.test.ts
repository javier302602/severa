import {
  COBERTURA_MINIMA_DE_PERIODOS,
  MINIMO_DE_PERIODOS,
  evaluarSerieDeTiempo
} from '../../../../src/domain/services/variable-detection/SerieDeTiempoGenerico';

// RF-108 (M-14, Ronda 2): "si el dataset contiene una columna de tipo fecha o
// fecha-hora con una frecuencia temporal suficientemente regular, el sistema
// identifica la columna temporal y señala la viabilidad de tratarlo como
// serie de tiempo".

function dia(anio: number, mes: number, numero: number): string {
  return new Date(Date.UTC(anio, mes - 1, numero)).toISOString().slice(0, 10);
}

// `cantidad` días consecutivos a partir de una fecha.
function diasConsecutivos(anio: number, mes: number, desde: number, cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, i) => dia(anio, mes, desde + i));
}

function filasDe(columnas: Record<string, unknown[]>): Array<Record<string, unknown>> {
  const nombres = Object.keys(columnas);
  const largo = columnas[nombres[0]].length;
  return Array.from({ length: largo }, (_, i) => Object.fromEntries(nombres.map((nombre) => [nombre, columnas[nombre][i]])));
}

describe('RF-108 — identificar la columna temporal', () => {
  test('sin columnas de fecha no hay serie de tiempo posible', () => {
    const filas = filasDe({ producto: ['a', 'b', 'c', 'a', 'b', 'c'], precio: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5] });

    const evaluacion = evaluarSerieDeTiempo(['producto', 'precio'], filas);

    expect(evaluacion.columnasTemporales).toEqual([]);
    expect(evaluacion.esViableComoSerieDeTiempo).toBe(false);
    expect(evaluacion.columnaSugerida).toBeNull();
    expect(evaluacion.resumen).toMatch(/no tiene ninguna columna de fecha/);
    expect(evaluacion.variablesNumericas).toEqual(['precio']);
  });

  test('un registro por día: serie diaria directa, con los números que la justifican', () => {
    const fechas = diasConsecutivos(2024, 3, 1, 10);
    const filas = filasDe({ fecha: fechas, ventas: [10, 12, 9, 14, 11, 13, 15, 8, 12, 10] });

    const evaluacion = evaluarSerieDeTiempo(['fecha', 'ventas'], filas);

    expect(evaluacion.esViableComoSerieDeTiempo).toBe(true);
    expect(evaluacion.columnaSugerida).toBe('fecha');
    expect(evaluacion.variablesNumericas).toEqual(['ventas']);
    expect(evaluacion.columnasTemporales).toHaveLength(1);
    expect(evaluacion.columnasTemporales[0]).toMatchObject({
      columna: 'fecha',
      tipo: 'fecha',
      valoresValidos: 10,
      instantesDistintos: 10,
      desde: '2024-03-01T00:00:00.000Z',
      hasta: '2024-03-10T00:00:00.000Z',
      viabilidad: 'directa',
      frecuencia: 'diaria',
      periodosConDatos: 10,
      periodosFaltantes: 0,
      cobertura: 1
    });
    expect(evaluacion.resumen).toBe('Se puede tratar como serie de tiempo diaria usando «fecha» como eje temporal.');
  });

  test('las fechas en día/mes/año se leen igual que las ISO', () => {
    const fechas = Array.from({ length: 10 }, (_, i) => `${String(i + 13).padStart(2, '0')}/01/2024`);

    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: fechas })).columnasTemporales;

    // Del 13 al 22 de enero: si se leyeran como mes/día, ninguna sería válida.
    expect(columna).toMatchObject({ valoresValidos: 10, frecuencia: 'diaria', desde: '2024-01-13T00:00:00.000Z', hasta: '2024-01-22T00:00:00.000Z' });
  });

  test('el orden de las filas no importa', () => {
    const fechas = diasConsecutivos(2024, 3, 1, 10);
    const desordenadas = [fechas[7], fechas[2], fechas[9], fechas[0], fechas[5], fechas[1], fechas[8], fechas[3], fechas[6], fechas[4]];

    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: desordenadas })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'diaria', cobertura: 1 });
  });
});

describe('RF-108 — la frecuencia es la más fina que resulta regular', () => {
  test('el día 1 de cada mes: mensual, no "diaria con casi todo faltante"', () => {
    const fechas = Array.from({ length: 12 }, (_, i) => dia(2023, i + 1, 1));

    const [columna] = evaluarSerieDeTiempo(['mes'], filasDe({ mes: fechas })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'mensual', periodosConDatos: 12, periodosFaltantes: 0, cobertura: 1 });
  });

  test('todos los lunes: semanal', () => {
    // El 1 de enero de 2024 fue lunes.
    const lunes = Array.from({ length: 10 }, (_, i) => dia(2024, 1, 1 + 7 * i));

    const [columna] = evaluarSerieDeTiempo(['semana'], filasDe({ semana: lunes })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'semanal', periodosConDatos: 10, periodosFaltantes: 0 });
  });

  test('inicio de cada trimestre durante dos años: trimestral', () => {
    const trimestres = [2022, 2023].flatMap((anio) => [1, 4, 7, 10].map((mes) => dia(anio, mes, 1)));

    const [columna] = evaluarSerieDeTiempo(['trimestre'], filasDe({ trimestre: trimestres })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'trimestral', periodosConDatos: 8 });
  });

  test('un dato por año: anual', () => {
    const anios = Array.from({ length: 10 }, (_, i) => dia(2010 + i, 6, 30));

    const [columna] = evaluarSerieDeTiempo(['cierre'], filasDe({ cierre: anios })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'anual', periodosConDatos: 10 });
  });

  test('una marca por hora: horaria (solo se buscan frecuencias menores al día si la columna trae hora)', () => {
    const horas = Array.from({ length: 24 }, (_, i) => `2024-05-10T${String(i).padStart(2, '0')}:00:00Z`);

    const [columna] = evaluarSerieDeTiempo(['momento'], filasDe({ momento: horas })).columnasTemporales;

    expect(columna).toMatchObject({ tipo: 'fecha_hora', viabilidad: 'directa', frecuencia: 'horaria', periodosConDatos: 24, cobertura: 1 });
  });

  test('una marca diaria que trae hora (siempre a las 8) es diaria, no horaria', () => {
    const marcas = diasConsecutivos(2024, 3, 1, 10).map((fecha) => `${fecha} 08:00`);

    const [columna] = evaluarSerieDeTiempo(['momento'], filasDe({ momento: marcas })).columnasTemporales;

    expect(columna).toMatchObject({ tipo: 'fecha_hora', viabilidad: 'directa', frecuencia: 'diaria' });
  });

  test('lunes a viernes: diaria de días hábiles, sin contar los fines de semana como faltantes', () => {
    // Tres semanas completas de lunes a viernes a partir del lunes 1/1/2024.
    const habiles = [0, 7, 14].flatMap((inicio) => [1, 2, 3, 4, 5].map((d) => dia(2024, 1, inicio + d)));

    const [columna] = evaluarSerieDeTiempo(['jornada'], filasDe({ jornada: habiles })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'diaria_habil', periodosConDatos: 15, periodosFaltantes: 0, cobertura: 1 });
    expect(columna.motivo).toMatch(/días hábiles, lunes a viernes/);
  });

  test('dos semanas de lunes a viernes también son "días hábiles" (no "diaria con 2 faltantes")', () => {
    const habiles = [0, 7].flatMap((inicio) => [1, 2, 3, 4, 5].map((d) => dia(2024, 1, inicio + d)));

    const [columna] = evaluarSerieDeTiempo(['jornada'], filasDe({ jornada: habiles })).columnasTemporales;

    expect(columna).toMatchObject({ frecuencia: 'diaria_habil', periodosFaltantes: 0 });
  });

  test('si hay algún sábado o domingo, es diaria común', () => {
    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: diasConsecutivos(2024, 1, 1, 14) })).columnasTemporales;

    expect(columna.frecuencia).toBe('diaria');
  });
});

describe('RF-108 — viabilidad', () => {
  test('varias transacciones por día: es serie diaria, pero hay que agregar', () => {
    const fechas = diasConsecutivos(2024, 3, 1, 10).flatMap((fecha) => [fecha, fecha, fecha]);
    const filas = filasDe({ fecha: fechas, monto: fechas.map((_, i) => i + 0.5) });

    const evaluacion = evaluarSerieDeTiempo(['fecha', 'monto'], filas);
    const [columna] = evaluacion.columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'requiere_agregacion', frecuencia: 'diaria', valoresValidos: 30, periodosConDatos: 10, cobertura: 1 });
    expect(columna.motivo).toMatch(/30 registros repartidos en 10 períodos/);
    expect(evaluacion.esViableComoSerieDeTiempo).toBe(true);
    expect(evaluacion.resumen).toMatch(/resumiendo antes los registros de cada período/);
  });

  test('se toleran algunos períodos sin datos, y se informa cuántos', () => {
    // 20 días seguidos menos 2: cobertura 18/20 = 90%.
    const fechas = diasConsecutivos(2024, 3, 1, 20).filter((_, i) => i !== 6 && i !== 13);

    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: fechas })).columnasTemporales;

    expect(columna).toMatchObject({ viabilidad: 'directa', frecuencia: 'diaria', periodosConDatos: 18, periodosFaltantes: 2, cobertura: 0.9 });
    expect(columna.motivo).toMatch(/2 período\(s\) sin datos/);
  });

  test('fechas sueltas sin ninguna regularidad: no viable, y dice cuál fue la más cercana', () => {
    // 9 fechas repartidas sin ningún patrón a lo largo de 6 años.
    const fechas = ['2018-01-03', '2018-01-04', '2018-09-21', '2019-02-11', '2020-07-30', '2021-03-08', '2021-03-09', '2023-11-15', '2023-12-25'];

    const evaluacion = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: fechas }));
    const [columna] = evaluacion.columnasTemporales;

    expect(columna.viabilidad).toBe('no_viable');
    expect(columna.frecuencia).toBeNull();
    expect(columna.cobertura).toBeLessThan(COBERTURA_MINIMA_DE_PERIODOS);
    expect(columna.motivo).toMatch(/no siguen una frecuencia regular/);
    expect(evaluacion.esViableComoSerieDeTiempo).toBe(false);
    expect(evaluacion.columnaSugerida).toBeNull();
    expect(evaluacion.resumen).toMatch(/ninguna tiene una frecuencia suficientemente regular/);
  });

  test(`menos de ${MINIMO_DE_PERIODOS} momentos distintos: no viable, aunque sean consecutivos`, () => {
    const fechas = diasConsecutivos(2024, 3, 1, MINIMO_DE_PERIODOS - 1);

    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: fechas })).columnasTemporales;

    expect(columna.viabilidad).toBe('no_viable');
    expect(columna.motivo).toBe(`Solo hay ${MINIMO_DE_PERIODOS - 1} momento(s) distinto(s); se consideran necesarios al menos ${MINIMO_DE_PERIODOS} períodos para hablar de una serie de tiempo.`);
  });

  test(`justo en el mínimo (${MINIMO_DE_PERIODOS} períodos) ya es viable`, () => {
    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: diasConsecutivos(2024, 3, 2, MINIMO_DE_PERIODOS) })).columnasTemporales;

    expect(columna.viabilidad).toBe('directa');
  });

  test('los valores vacíos o que no son fechas no cuentan, y no rompen nada', () => {
    const fechas = [...diasConsecutivos(2024, 3, 1, 10), '', null, 'sin fecha'];

    const [columna] = evaluarSerieDeTiempo(['fecha'], filasDe({ fecha: fechas })).columnasTemporales;

    expect(columna).toMatchObject({ valoresValidos: 10, viabilidad: 'directa', frecuencia: 'diaria' });
  });

  test('sin columnas numéricas, avisa que la serie posible es el conteo por período', () => {
    const filas = filasDe({ fecha: diasConsecutivos(2024, 3, 1, 10), sede: ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'] });

    const evaluacion = evaluarSerieDeTiempo(['fecha', 'sede'], filas);

    expect(evaluacion.variablesNumericas).toEqual([]);
    expect(evaluacion.resumen).toMatch(/la serie posible es la cantidad de registros por período/);
  });
});

describe('RF-108 — con más de una columna temporal', () => {
  test('sugiere la que es serie directa antes que la que requiere agregar', () => {
    // 16 pedidos: uno por día de alta, pero despachados de a dos por día.
    const alta = diasConsecutivos(2024, 3, 1, 16);
    const despacho = alta.map((_, i) => dia(2024, 4, 1 + Math.floor(i / 2)));

    const evaluacion = evaluarSerieDeTiempo(['despacho', 'alta'], filasDe({ despacho, alta }));

    const porColumna = Object.fromEntries(evaluacion.columnasTemporales.map((columna) => [columna.columna, columna.viabilidad]));
    expect(porColumna).toEqual({ despacho: 'requiere_agregacion', alta: 'directa' });
    expect(evaluacion.columnaSugerida).toBe('alta');
    // Se informan las dos, en el orden del archivo.
    expect(evaluacion.columnasTemporales.map((columna) => columna.columna)).toEqual(['despacho', 'alta']);
  });
});

describe('RF-108 + RF-111 — respeta el tipo corregido por el analista', () => {
  const periodos = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10'];

  test('una columna de fechas marcada a mano como categórica deja de evaluarse como temporal', () => {
    const filas = filasDe({ fecha: diasConsecutivos(2024, 3, 1, 10) });

    expect(evaluarSerieDeTiempo(['fecha'], filas).esViableComoSerieDeTiempo).toBe(true);

    const corregida = evaluarSerieDeTiempo(['fecha'], filas, { fecha: 'categorica_nominal' });
    expect(corregida.columnasTemporales).toEqual([]);
    expect(corregida.esViableComoSerieDeTiempo).toBe(false);
  });

  test('una corrección a "fecha" que no se puede aplicar (ningún valor es una fecha) no inventa una columna temporal', () => {
    const evaluacion = evaluarSerieDeTiempo(['periodo'], filasDe({ periodo: periodos }), { periodo: 'fecha' });

    expect(evaluacion.columnasTemporales).toEqual([]);
  });

  test('una columna numérica marcada como categórica no se ofrece como variable a observar en el tiempo', () => {
    const filas = filasDe({ fecha: diasConsecutivos(2024, 3, 1, 10), sucursal: [1, 2, 3, 1, 2, 3, 1, 2, 3, 1] });

    expect(evaluarSerieDeTiempo(['fecha', 'sucursal'], filas).variablesNumericas).toEqual(['sucursal']);
    expect(evaluarSerieDeTiempo(['fecha', 'sucursal'], filas, { sucursal: 'categorica_nominal' }).variablesNumericas).toEqual([]);
  });
});
