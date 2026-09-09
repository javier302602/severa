import { analizarColumnaUnivariado, AnalisisUnivariadoNumerico, AnalisisUnivariadoCategorico, AnalisisUnivariadoFecha } from '../../../../src/domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import { DatasetInvalidoError } from '../../../../src/domain/errors/DatasetInvalidoError';
import { NumeroDeIntervalosInvalidoError } from '../../../../src/domain/errors/NumeroDeIntervalosInvalidoError';
import { calcularCantidadIntervalosAutomatica } from '../../../../src/domain/services/descriptive-statistics/DistribucionFrecuencias';

describe('AnalisisUnivariadoGenerico — Mejora 4 (Análisis de Datos General) Fase 3', () => {
  test('columna inexistente tira DatasetInvalidoError con mensaje claro', () => {
    expect(() => analizarColumnaUnivariado('noExiste', ['precio'], [{ precio: 10 }])).toThrow(DatasetInvalidoError);
    expect(() => analizarColumnaUnivariado('noExiste', ['precio'], [{ precio: 10 }])).toThrow('"noExiste"');
  });

  test('columna numérica: resumen de cinco números + moda + distribución agrupada que cubre todos los valores', () => {
    const filas = [10, 20, 20, 30, 40, 50, 60, 70, 80, 90].map((precio) => ({ precio }));

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

    expect(analisis.tipo).toBe('numerica');
    expect(analisis.valoresValidos).toBe(10);
    expect(analisis.valoresFaltantes).toBe(0);
    expect(analisis.resumenCincoNumeros.minimo).toBe(10);
    expect(analisis.resumenCincoNumeros.maximo).toBe(90);
    expect(analisis.moda).toEqual([20]);

    const totalEnDistribucion = analisis.distribucion.reduce((acumulado, bin) => acumulado + bin.frecuenciaAbsoluta, 0);
    expect(totalEnDistribucion).toBe(10);
  });

  test('columna numérica: los límites de los intervalos automáticos no arrastran restos de coma flotante (Fase 5, bug real confirmado generando el informe)', () => {
    const filas = [10, 12, 11, 13, 12, 100].map((cantidad) => ({ cantidad }));

    const analisis = analizarColumnaUnivariado('cantidad', ['cantidad'], filas) as AnalisisUnivariadoNumerico;

    analisis.distribucion.forEach((bin) => {
      expect(bin.limiteInferior).toBe(Number(bin.limiteInferior.toFixed(6)));
      expect(bin.limiteSuperior).toBe(Number(bin.limiteSuperior.toFixed(6)));
    });
  });

  test('columna numérica con todos los valores idénticos: un único bin, sin dividir por cero', () => {
    const filas = [5, 5, 5, 5].map((precio) => ({ precio }));

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

    expect(analisis.distribucion).toHaveLength(1);
    expect(analisis.distribucion[0].frecuenciaAbsoluta).toBe(4);
    expect(analisis.varianza).toBe(0);
  });

  test('columna numérica con un solo valor no vacío: varianza/desviación/coeficiente quedan en null', () => {
    const analisis = analizarColumnaUnivariado('precio', ['precio'], [{ precio: 42 }]) as AnalisisUnivariadoNumerico;

    expect(analisis.varianza).toBeNull();
    expect(analisis.desviacionEstandar).toBeNull();
    expect(analisis.coeficienteVariacion).toBeNull();
  });

  test('cuenta valores faltantes correctamente junto a los válidos', () => {
    const filas = [{ precio: 10 }, { precio: null }, { precio: 30 }, { precio: '' }];

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

    expect(analisis.valoresValidos).toBe(2);
    expect(analisis.valoresFaltantes).toBe(2);
  });

  test('columna categórica: distribución completa (no solo el top) y moda como el/los valores más frecuentes', () => {
    const filas = ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Arequipa'].map((ciudad) => ({ ciudad }));

    const analisis = analizarColumnaUnivariado('ciudad', ['ciudad'], filas) as AnalisisUnivariadoCategorico;

    expect(analisis.tipo).toBe('categorica');
    expect(analisis.valoresUnicos).toBe(3);
    expect(analisis.distribucion).toHaveLength(3);
    expect(analisis.moda).toEqual(['Lima']);
    const totalPorcentaje = analisis.distribucion.reduce((acumulado, fila) => acumulado + fila.frecuenciaRelativaPorcentaje, 0);
    expect(totalPorcentaje).toBeCloseTo(100, 5);
  });

  test('columna categórica con empate en la moda: devuelve todos los valores empatados', () => {
    const filas = ['Lima', 'Cusco'].map((ciudad) => ({ ciudad }));

    const analisis = analizarColumnaUnivariado('ciudad', ['ciudad'], filas) as AnalisisUnivariadoCategorico;

    expect(analisis.moda.sort()).toEqual(['Cusco', 'Lima']);
  });

  test('columna de fecha: agrupa la distribución por día calendario y reporta rango', () => {
    const filas = [{ fecha: '2024-01-15' }, { fecha: '2024-01-15' }, { fecha: '2024-03-10' }];

    const analisis = analizarColumnaUnivariado('fecha', ['fecha'], filas) as AnalisisUnivariadoFecha;

    expect(analisis.tipo).toBe('fecha');
    expect(analisis.valoresValidos).toBe(3);
    expect(new Date(analisis.minimo!).toISOString().slice(0, 10)).toBe('2024-01-15');
    expect(new Date(analisis.maximo!).toISOString().slice(0, 10)).toBe('2024-03-10');
    const bin15Enero = analisis.distribucion.find((fila) => fila.valor === '2024-01-15');
    expect(bin15Enero?.frecuenciaAbsoluta).toBe(2);
  });

  // Bug real (mismo encontrado en GraficosEstadisticos/GeometriaDeGraficos,
  // 2026-07-19): generarIntervalosAutomaticos usaba Math.min(...valores)/
  // Math.max(...valores) — con una columna numérica de más de ~120k-130k
  // filas (umbral real de argumentos por llamada de V8), esto lanzaba
  // "RangeError: Maximum call stack size exceeded".
  test('columna numérica con 200.000 filas no lanza (antes rompía por Math.min/max con spread)', () => {
    const filas = Array.from({ length: 200_000 }, (_, i) => ({ valor: i % 1000 }));

    expect(() => analizarColumnaUnivariado('valor', ['valor'], filas)).not.toThrow();

    const analisis = analizarColumnaUnivariado('valor', ['valor'], filas) as AnalisisUnivariadoNumerico;
    expect(analisis.valoresValidos).toBe(200_000);
  });

  // RF-39: override manual del número de intervalos, en vez del cálculo
  // automático por Sturges.
  test('con numeroDeIntervalos manual, usa exactamente esa cantidad de intervalos (no Sturges)', () => {
    const filas = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((precio) => ({ precio }));

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas, 4) as AnalisisUnivariadoNumerico;

    expect(analisis.distribucion).toHaveLength(4);
    const totalEnDistribucion = analisis.distribucion.reduce((acumulado, bin) => acumulado + bin.frecuenciaAbsoluta, 0);
    expect(totalEnDistribucion).toBe(10);
  });

  test.each([0, 1, -3, 31])(
    'numeroDeIntervalos inválido (%i) tira NumeroDeIntervalosInvalidoError',
    (numeroDeIntervalos) => {
      const filas = [10, 20, 30].map((precio) => ({ precio }));
      expect(() => analizarColumnaUnivariado('precio', ['precio'], filas, numeroDeIntervalos)).toThrow(
        NumeroDeIntervalosInvalidoError
      );
    }
  );

  // RF-45/RF-48/RF-50: valores de referencia reutilizando el mismo
  // subconjunto ya verificado en EstadisticaDescriptiva.test.ts (los 12
  // valores positivos del fixture de 13 CVSS Score, sin el 0.0).
  test('rango, media geométrica y media armónica: valores de referencia', () => {
    const filas = [2.1, 2.4, 3.6, 4.0, 4.0, 4.9, 5.5, 6.7, 7.2, 8.8, 9.0, 10.0].map((precio) => ({ precio }));

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

    expect(analisis.rango).toBeCloseTo(10.0 - 2.1, 6);
    expect(analisis.mediaGeometrica).toBeCloseTo(5.0850515017, 4);
    expect(analisis.mediaArmonica).toBeCloseTo(4.4953504084, 4);
  });

  test('media geométrica y armónica quedan en null si la columna tiene un valor negativo', () => {
    const filas = [-1, 2.1, 2.4, 3.6, 4.0].map((precio) => ({ precio }));

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

    expect(analisis.mediaGeometrica).toBeNull();
    expect(analisis.mediaArmonica).toBeNull();
  });

  test('sin numeroDeIntervalos, el comportamiento automático (Sturges) sigue sin cambios', () => {
    const filas = [10, 20, 20, 30, 40, 50, 60, 70, 80, 90].map((precio) => ({ precio }));

    const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

    // Sturges para n=10: ceil(log2(10)+1) = ceil(4.32) = 5, dentro de [3,10].
    expect(analisis.distribucion).toHaveLength(5);
  });

  // M-05 (retoma): calcularCantidadIntervalosAutomatica() se extrajo de acá
  // (era una función privada de este archivo) a DistribucionFrecuencias.ts,
  // para que GenerarDistribucionFrecuencias.ts (M-05) también la reutilice.
  // Estos tests confirman explícitamente que el resultado NO cambió con la
  // extracción — mismos umbrales exactos (3 mínimo, 10 máximo), tanto en
  // los bordes de la acotación como en un caso intermedio, cruzando el
  // resultado de analizarColumnaUnivariado (consumidor real) contra una
  // llamada directa a la función compartida (no una coincidencia puntual).
  describe('calcularCantidadIntervalosAutomatica compartida con DistribucionFrecuencias.ts (no-regresión de la extracción)', () => {
    test.each([
      [3, 3], // n muy chico -> clampeado al mínimo (3)
      [4, 3], // ceil(log2(4)+1) = 3, ya en el piso
      [10, 5], // caso intermedio ya cubierto arriba, repetido acá para cruzar con la función directa
      [64, 7], // ceil(log2(64)+1) = 7
      [10000, 10] // n muy grande -> clampeado al máximo (10)
    ])('n=%i -> %i intervalos, igual en analizarColumnaUnivariado y en la función compartida', (n, intervalosEsperados) => {
      const filas = Array.from({ length: n }, (_, i) => ({ precio: i }));
      const analisis = analizarColumnaUnivariado('precio', ['precio'], filas) as AnalisisUnivariadoNumerico;

      expect(analisis.distribucion).toHaveLength(intervalosEsperados);
      expect(calcularCantidadIntervalosAutomatica(n)).toBe(intervalosEsperados);
    });
  });
});
