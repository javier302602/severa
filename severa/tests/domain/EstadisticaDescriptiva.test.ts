import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion,
  calcularMediaGeometrica,
  calcularMediaArmonica,
  calcularResumenCincoNumeros
} from '../../src/domain/services/EstadisticaDescriptiva';

describe('EstadisticaDescriptiva', () => {
  const scores = [0.0, 2.1, 2.4, 3.6, 4.0, 4.0, 4.9, 5.5, 6.7, 7.2, 8.8, 9.0, 10.0];

  test('calcula la media correctamente', () => {
    expect(calcularMedia(scores)).toBeCloseTo(5.2461538462, 4);
  });

  test('calcula la mediana correctamente', () => {
    expect(calcularMediana(scores)).toBeCloseTo(4.9, 4);
  });

  test('calcula la moda correctamente', () => {
    expect(calcularModa(scores)).toEqual([4.0]);
  });

  test('calcula los cuartiles Q1 y Q3 correctamente', () => {
    const { q1, q3 } = calcularCuartiles(scores);
    expect(q1).toBeCloseTo(3.6, 4);
    expect(q3).toBeCloseTo(7.2, 4);
  });

  test('calcula el rango correctamente', () => {
    expect(calcularRango(scores)).toBeCloseTo(10.0, 4);
  });

  test('calcula la varianza muestral correctamente', () => {
    expect(calcularVarianzaMuestral(scores)).toBeCloseTo(8.8976923077, 4);
  });

  test('calcula la desviación estándar muestral correctamente', () => {
    expect(calcularDesviacionEstandarMuestral(scores)).toBeCloseTo(2.9828999828, 4);
  });

  test('calcula el coeficiente de variación correctamente', () => {
    expect(calcularCoeficienteVariacion(scores)).toBeCloseTo(56.8588, 4);
  });

  test('calcula la media geométrica correctamente', () => {
    expect(calcularMediaGeometrica(scores)).toBeCloseTo(5.0850515017, 4);
  });

  test('calcula la media armónica correctamente', () => {
    expect(calcularMediaArmonica(scores)).toBeCloseTo(4.4953504084, 4);
  });

  // Fase 0: el rango 0.0-10.0 era una validación redundante con
  // CvssScore.ts (que ya lo garantiza al construirse) y bloqueaba reusar
  // estas mismas fórmulas sobre cualquier otro número — bug real encontrado
  // en GraficosEstadisticos.generarDatosHistogramaDiasParche. Ahora deben
  // aceptar valores fuera de ese rango sin problema.
  test('acepta valores fuera del rango 0-10 (ya no está acoplado a CVSS)', () => {
    const diasParaParche = [1, 5, 22, 45, 90];

    expect(calcularMedia(diasParaParche)).toBeCloseTo(32.6, 5);
    expect(calcularMediana(diasParaParche)).toBe(22);
    expect(() => calcularVarianzaMuestral(diasParaParche)).not.toThrow();
  });

  test('sigue rechazando una lista vacía, con la etiqueta esperada en el mensaje', () => {
    expect(() => calcularMedia([])).toThrow('La lista de CVSS Score no puede estar vacía');
    expect(() => calcularMedia([], 'Días para Parche')).toThrow('La lista de Días para Parche no puede estar vacía');
  });

  test('calcularResumenCincoNumeros junta mínimo/Q1/mediana/Q3/máximo/media consistentes con el resto de las funciones', () => {
    const resumen = calcularResumenCincoNumeros(scores);

    expect(resumen.minimo).toBe(0.0);
    expect(resumen.maximo).toBe(10.0);
    expect(resumen.q1).toBeCloseTo(3.6, 4);
    expect(resumen.q3).toBeCloseTo(7.2, 4);
    expect(resumen.mediana).toBeCloseTo(calcularMediana(scores), 10);
    expect(resumen.media).toBeCloseTo(calcularMedia(scores), 10);
  });
});
