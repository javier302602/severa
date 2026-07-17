import { detectarOutliers } from '../../src/domain/services/DeteccionOutliersGenerico';

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
    expect(columna.valoresAtipicos).toEqual([{ filaIndice: 5, valor: 100 }]);
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

    expect(resultado.columnas[0].valoresAtipicos).toEqual([{ filaIndice: 5, valor: 100 }]);
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
});
