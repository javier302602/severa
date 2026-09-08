import { detectarOutliers } from '../../../../src/domain/services/data-cleaning/DeteccionOutliersGenerico';

describe('DeteccionOutliersGenerico — Mejora 4 (Análisis de Datos General) Fase 4', () => {
  test('detecta un valor claramente atípico por encima del límite superior (1.5×IQR)', () => {
    const filas = [10, 12, 11, 13, 12, 100].map((precio) => ({ precio }));

    const resultado = detectarOutliers(['precio'], filas);

    expect(resultado.columnas).toHaveLength(1);
    const columna = resultado.columnas[0];
    expect(columna.q1).toBeCloseTo(11.25, 5);
    expect(columna.q3).toBeCloseTo(12.75, 5);
    expect(columna.limiteSuperior).toBeCloseTo(15, 5);
    expect(columna.limiteInferior).toBeCloseTo(9, 5);
    expect(columna.cantidadValoresAtipicos).toBe(1);
    // El propio 100 infla tanto la media (26.33) y la desviación estándar
    // (~36.1) que 3×sigma (~108.3) lo deja DENTRO del límite superior sigma
    // (~134.6) — "enmascaramiento" real del criterio de desviación estándar
    // con muestras chicas: por eso RF-119 pide los dos criterios en
    // paralelo, no uno solo. Ver el describe de abajo para el caso donde sí
    // coinciden ambos.
    expect(columna.valoresAtipicos).toEqual([{ filaIndice: 5, valor: 100, detectadoPor: ['iqr'] }]);
  });

  test('sin valores fuera del rango, no reporta atípicos', () => {
    const filas = [10, 11, 12, 13, 12].map((precio) => ({ precio }));

    const resultado = detectarOutliers(['precio'], filas);

    expect(resultado.columnas[0].cantidadValoresAtipicos).toBe(0);
    expect(resultado.columnas[0].valoresAtipicos).toEqual([]);
  });

  test('ignora filas con valores faltantes al calcular el índice (usa el índice real del dataset)', () => {
    const filas = [{ precio: 10 }, { precio: null }, { precio: 11 }, { precio: 12 }, { precio: 13 }, { precio: 100 }];

    const resultado = detectarOutliers(['precio'], filas);

    expect(resultado.columnas[0].valoresAtipicos).toEqual([{ filaIndice: 5, valor: 100, detectadoPor: ['iqr'] }]);
  });

  test('columna no numérica queda excluida, con motivo, sin romper la respuesta', () => {
    const filas = [{ ciudad: 'Lima' }, { ciudad: 'Cusco' }, { ciudad: 'Arequipa' }];

    const resultado = detectarOutliers(['ciudad'], filas);

    expect(resultado.columnas).toEqual([]);
    expect(resultado.columnasExcluidas).toEqual([{ nombre: 'ciudad', motivo: 'La columna no es numérica' }]);
  });

  test('columna numérica con menos de 2 valores válidos queda excluida en vez de romper la respuesta', () => {
    const filas = [{ precio: 10 }, { precio: null }, { precio: null }];

    const resultado = detectarOutliers(['precio'], filas);

    expect(resultado.columnas).toEqual([]);
    expect(resultado.columnasExcluidas).toEqual([{ nombre: 'precio', motivo: 'Menos de 2 valores numéricos válidos' }]);
  });

  test('procesa varias columnas, cada una con su propio Q1/Q3 independiente', () => {
    const filas = [
      { precio: 10, peso: 1 },
      { precio: 20, peso: 2 },
      { precio: 30, peso: 3 }
    ];

    const resultado = detectarOutliers(['precio', 'peso'], filas);

    expect(resultado.columnas.map((c) => c.columna).sort()).toEqual(['peso', 'precio']);
  });

  // M-15 (RF-119): criterio de desviación estándar (3 sigma) en paralelo al
  // de IQR, nunca reemplazándolo.
  describe('criterio de desviación estándar (RF-119)', () => {
    test('calcula media, desviación estándar y límites de 3 sigma junto a los de IQR', () => {
      const filas = [10, 20, 30, 40, 50].map((precio) => ({ precio }));

      const resultado = detectarOutliers(['precio'], filas);

      const columna = resultado.columnas[0];
      expect(columna.media).toBeCloseTo(30, 4);
      expect(columna.desviacionEstandar).toBeCloseTo(15.8114, 3);
      expect(columna.limiteInferiorSigma).toBeCloseTo(30 - 3 * 15.8114, 2);
      expect(columna.limiteSuperiorSigma).toBeCloseTo(30 + 3 * 15.8114, 2);
      expect(columna.cantidadValoresAtipicos).toBe(0);
    });

    test('un valor extremo en una muestra más grande queda marcado por ambos criterios a la vez', () => {
      const base = Array.from({ length: 30 }, (_, i) => 19 + (i % 4));
      const filas = [...base, 200].map((precio) => ({ precio }));

      const resultado = detectarOutliers(['precio'], filas);

      const atipico = resultado.columnas[0].valoresAtipicos.find((valor) => valor.valor === 200);
      expect(atipico).toBeDefined();
      expect([...atipico!.detectadoPor].sort()).toEqual(['desviacion_estandar', 'iqr']);
    });

    test('un outlier extremo en una muestra chica puede "enmascararse" a sí mismo para el criterio sigma (solo IQR lo marca)', () => {
      // Mismo dataset que el primer test del archivo: el propio 100 infla
      // tanto la media como la desviación estándar de una muestra de 6 que
      // el límite de 3 sigma termina siendo más ancho que el propio valor —
      // por esto RF-119 pide ambos criterios en paralelo, no solo uno.
      const filas = [10, 12, 11, 13, 12, 100].map((precio) => ({ precio }));

      const resultado = detectarOutliers(['precio'], filas);

      const atipico = resultado.columnas[0].valoresAtipicos.find((valor) => valor.valor === 100);
      expect(atipico!.detectadoPor).toEqual(['iqr']);
    });
  });
});
