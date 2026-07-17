import { calcularEstadisticasDescriptivas, ResumenColumnaNumerica, ResumenColumnaCategorica, ResumenColumnaFecha } from '../../src/domain/services/EstadisticasDescriptivasGenerico';

describe('EstadisticasDescriptivasGenerico — Mejora 4 (Análisis de Datos General) Fase 3', () => {
  test('calcula media/mediana/moda/cuartiles/rango para una columna numérica', () => {
    const columnas = ['precio'];
    const filas = [10, 20, 20, 30, 40].map((precio) => ({ precio }));

    const [resumen] = calcularEstadisticasDescriptivas(columnas, filas) as [ResumenColumnaNumerica];

    expect(resumen.tipo).toBe('numerica');
    expect(resumen.valoresValidos).toBe(5);
    expect(resumen.media).toBe(24);
    expect(resumen.mediana).toBe(20);
    expect(resumen.moda).toEqual([20]);
    expect(resumen.minimo).toBe(10);
    expect(resumen.maximo).toBe(40);
    expect(resumen.rango).toBe(30);
    expect(resumen.varianza).not.toBeNull();
    expect(resumen.desviacionEstandar).not.toBeNull();
  });

  test('columna numérica con un solo valor no vacío: varianza/desviación estándar quedan en null (no explota)', () => {
    const resumen = calcularEstadisticasDescriptivas(['precio'], [{ precio: 10 }])[0] as ResumenColumnaNumerica;

    expect(resumen.tipo).toBe('numerica');
    expect(resumen.varianza).toBeNull();
    expect(resumen.desviacionEstandar).toBeNull();
    expect(resumen.media).toBe(10);
  });

  test('columna categórica: cuenta valores únicos y devuelve el top de más frecuentes', () => {
    const filas = ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Lima'].map((ciudad) => ({ ciudad }));

    const resumen = calcularEstadisticasDescriptivas(['ciudad'], filas)[0] as ResumenColumnaCategorica;

    expect(resumen.tipo).toBe('categorica');
    expect(resumen.valoresUnicos).toBe(3);
    expect(resumen.masFrecuente[0]).toEqual({ valor: 'Lima', frecuencia: 5 });
  });

  test('columna de fecha: reporta el rango mínimo/máximo', () => {
    const filas = [{ fecha: '2024-01-15' }, { fecha: '2024-03-10' }, { fecha: '2024-02-01' }];

    const resumen = calcularEstadisticasDescriptivas(['fecha'], filas)[0] as ResumenColumnaFecha;

    expect(resumen.tipo).toBe('fecha');
    expect(resumen.valoresValidos).toBe(3);
    expect(new Date(resumen.minimo!).toISOString().slice(0, 10)).toBe('2024-01-15');
    expect(new Date(resumen.maximo!).toISOString().slice(0, 10)).toBe('2024-03-10');
  });

  test('columna completamente vacía no rompe: se degrada a categórica/texto con 0 valores válidos', () => {
    const resumen = calcularEstadisticasDescriptivas(['x'], [{ x: null }, { x: null }])[0] as ResumenColumnaCategorica;

    expect(resumen.valoresValidos).toBe(0);
    expect(resumen.valoresUnicos).toBe(0);
    expect(resumen.masFrecuente).toEqual([]);
  });

  test('procesa varias columnas de tipos distintos en un solo llamado, una entrada por columna', () => {
    const columnas = ['ciudad', 'precio'];
    const filas = [
      { ciudad: 'Lima', precio: 10 },
      { ciudad: 'Cusco', precio: 20 }
    ];

    const resumenes = calcularEstadisticasDescriptivas(columnas, filas);

    expect(resumenes).toHaveLength(2);
    expect(resumenes.map((r) => r.nombre)).toEqual(['ciudad', 'precio']);
  });
});
