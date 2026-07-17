import { calcularMatrizCorrelacion } from '../../src/domain/services/CorrelacionGenerico';

describe('CorrelacionGenerico — Mejora 4 (Análisis de Datos General) Fase 4', () => {
  test('calcula correlación de Pearson entre dos columnas numéricas en relación lineal exacta (1.0)', () => {
    const columnas = ['precio', 'cantidad'];
    const filas = [10, 20, 30, 40, 50].map((precio) => ({ precio, cantidad: precio * 10 }));

    const matriz = calcularMatrizCorrelacion(columnas, filas);

    expect(matriz.columnas.sort()).toEqual(['cantidad', 'precio']);
    const filaPrecio = matriz.filas.find((f) => f.columna === 'precio')!;
    const celda = filaPrecio.correlaciones.find((c) => c.columna === 'cantidad')!;
    expect(celda.valor).toBeCloseTo(1, 5);
  });

  test('correlación negativa exacta da -1', () => {
    const filas = [10, 20, 30, 40].map((precio) => ({ precio, stock: 100 - precio }));

    const matriz = calcularMatrizCorrelacion(['precio', 'stock'], filas);

    const celda = matriz.filas.find((f) => f.columna === 'precio')!.correlaciones.find((c) => c.columna === 'stock')!;
    expect(celda.valor).toBeCloseTo(-1, 5);
  });

  test('la matriz es simétrica: corr(X,Y) === corr(Y,X)', () => {
    const filas = [1, 2, 3, 7, 5].map((precio, indice) => ({ precio, ruido: [3, 1, 4, 1, 5][indice] }));

    const matriz = calcularMatrizCorrelacion(['precio', 'ruido'], filas);

    const xy = matriz.filas.find((f) => f.columna === 'precio')!.correlaciones.find((c) => c.columna === 'ruido')!.valor;
    const yx = matriz.filas.find((f) => f.columna === 'ruido')!.correlaciones.find((c) => c.columna === 'precio')!.valor;
    expect(xy).toBeCloseTo(yx!, 10);
  });

  test('la diagonal es siempre 1 para columnas incluidas', () => {
    const filas = [1, 2, 3].map((precio) => ({ precio }));
    const matriz = calcularMatrizCorrelacion(['precio'], filas);
    expect(matriz.filas[0].correlaciones[0]).toEqual({ columna: 'precio', valor: 1 });
  });

  test('columna no numérica queda excluida de la matriz, con motivo, sin romper la respuesta', () => {
    const filas = [
      { precio: 10, ciudad: 'Lima' },
      { precio: 20, ciudad: 'Cusco' },
      { precio: 30, ciudad: 'Arequipa' }
    ];

    const matriz = calcularMatrizCorrelacion(['precio', 'ciudad'], filas);

    expect(matriz.columnas).toEqual(['precio']);
    expect(matriz.columnasExcluidas).toEqual([{ nombre: 'ciudad', motivo: 'La columna no es numérica' }]);
  });

  test('columna numérica con menos de 2 valores válidos queda excluida en vez de romper la respuesta', () => {
    const filas = [
      { precio: 10, extra: 5 },
      { precio: 20, extra: null },
      { precio: 30, extra: null }
    ];

    const matriz = calcularMatrizCorrelacion(['precio', 'extra'], filas);

    expect(matriz.columnas).toEqual(['precio']);
    expect(matriz.columnasExcluidas).toEqual([{ nombre: 'extra', motivo: 'Menos de 2 valores numéricos válidos' }]);
  });

  test('dos columnas numéricas elegibles pero sin filas con ambas presentes a la vez: la celda queda en null con motivo', () => {
    // "a" tiene valor en las filas 0/1, "b" solo en las filas 2/3 — ninguna
    // fila aporta un par (a,b) válido, aunque cada columna por separado sí
    // llega al mínimo de 2 valores.
    const filas = [
      { a: 1, b: null },
      { a: 2, b: null },
      { a: null, b: 10 },
      { a: null, b: 20 }
    ];

    const matriz = calcularMatrizCorrelacion(['a', 'b'], filas);

    expect(matriz.columnas.sort()).toEqual(['a', 'b']);
    const celda = matriz.filas.find((f) => f.columna === 'a')!.correlaciones.find((c) => c.columna === 'b')!;
    expect(celda.valor).toBeNull();
    expect(celda.motivo).toBeDefined();
  });
});
