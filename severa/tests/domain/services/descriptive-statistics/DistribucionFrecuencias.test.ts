import {
  generarTablaAgrupada,
  generarTablaSinAgrupar,
  generarIntervalosEquiespaciados,
  validarNumeroDeIntervalos
} from '../../../../src/domain/services/descriptive-statistics/DistribucionFrecuencias';
import { NumeroDeIntervalosInvalidoError } from '../../../../src/domain/errors/NumeroDeIntervalosInvalidoError';

describe('DistribucionFrecuencias', () => {
  const scores = [0.0, 1.9, 2.1, 2.3, 3.7, 4.0, 4.3, 5.9, 6.0, 7.8, 8.5, 9.1, 9.9];

  test('genera tabla agrupada en intervalos definidos', () => {
    const tabla = generarTablaAgrupada(scores);
    expect(tabla[0]).toMatchObject({
      intervalo: '[0-2)',
      limiteInferior: 0,
      limiteSuperior: 2,
      marcaDeClase: 1,
      frecuenciaAbsoluta: 2,
      frecuenciaRelativa: 2 / scores.length,
      frecuenciaRelativaPorcentaje: (2 / scores.length) * 100,
      frecuenciaAcumulada: 2
    });
    expect(tabla[4]).toMatchObject({
      intervalo: '[8-10)',
      frecuenciaAbsoluta: 3,
      frecuenciaAcumulada: scores.length
    });
  });

  test('genera tabla sin agrupar con frecuencias exactas', () => {
    const tabla = generarTablaSinAgrupar(scores);
    expect(tabla).toContainEqual({ valor: 0.0, frecuencia: 1 });
    expect(tabla).toContainEqual({ valor: 9.9, frecuencia: 1 });
  });
});

describe('generarIntervalosEquiespaciados (RF-34/RF-39)', () => {
  // Test de regresión: confirma que las 5 bandas oficiales de CVSS
  // (INTERVALOS_POR_DEFECTO) son, matemáticamente, el caso por defecto de
  // esta misma función — no un caso aparte hardcodeado.
  test('con rango 0-10 y 5 intervalos, reproduce exactamente las bandas oficiales de CVSS', () => {
    expect(generarIntervalosEquiespaciados(0, 10, 5)).toEqual([
      { inferior: 0, superior: 2 },
      { inferior: 2, superior: 4 },
      { inferior: 4, superior: 6 },
      { inferior: 6, superior: 8 },
      { inferior: 8, superior: 10 }
    ]);
  });

  test('reparte un rango arbitrario en N intervalos iguales', () => {
    expect(generarIntervalosEquiespaciados(10, 90, 4)).toEqual([
      { inferior: 10, superior: 30 },
      { inferior: 30, superior: 50 },
      { inferior: 50, superior: 70 },
      { inferior: 70, superior: 90 }
    ]);
  });

  test('mínimo igual a máximo: un único intervalo, sin dividir por cero', () => {
    expect(generarIntervalosEquiespaciados(5, 5, 4)).toEqual([{ inferior: 5, superior: 5 }]);
  });

  test('no arrastra restos de coma flotante en los límites', () => {
    const intervalos = generarIntervalosEquiespaciados(0, 100, 3);
    intervalos.forEach((intervalo) => {
      expect(intervalo.inferior).toBe(Number(intervalo.inferior.toFixed(6)));
      expect(intervalo.superior).toBe(Number(intervalo.superior.toFixed(6)));
    });
  });
});

// Bug real: los límites se redondeaban siempre a 6 decimales. Una columna de
// precios quedaba con intervalos "[12-1643.333333)", etiquetas que se pisaban
// en el eje del histograma del informe.
describe('generarIntervalosEquiespaciados — precisión de los límites según el ancho del intervalo', () => {
  test('rango grande: límites enteros', () => {
    expect(generarIntervalosEquiespaciados(12, 9800, 6).map((intervalo) => intervalo.superior)).toEqual([1643, 3275, 4906, 6537, 8169, 9800]);
  });

  test('rango de unidades: dos decimales', () => {
    expect(generarIntervalosEquiespaciados(1, 44, 6).map((intervalo) => intervalo.superior)).toEqual([8.17, 15.33, 22.5, 29.67, 36.83, 44]);
  });

  test('rango muy chico: los decimales necesarios para que los límites no se confundan entre sí', () => {
    const intervalos = generarIntervalosEquiespaciados(0, 0.01, 4);
    expect(intervalos.map((intervalo) => intervalo.superior)).toEqual([0.0025, 0.005, 0.0075, 0.01]);
  });

  test('los extremos son el mínimo y el máximo reales, sin redondear (el mínimo nunca queda fuera de su intervalo)', () => {
    const intervalos = generarIntervalosEquiespaciados(12.6, 9800.4, 6);
    expect(intervalos[0].inferior).toBe(12.6);
    expect(intervalos[intervalos.length - 1].superior).toBe(9800.4);
  });

  test('los intervalos son contiguos y estrictamente crecientes', () => {
    [
      [12, 9800, 6],
      [1, 44, 6],
      [0, 0.01, 4],
      [-50.5, 50.5, 7],
      [0, 1e-7, 3]
    ].forEach(([minimo, maximo, cantidad]) => {
      const intervalos = generarIntervalosEquiespaciados(minimo, maximo, cantidad);
      expect(intervalos).toHaveLength(cantidad);
      intervalos.forEach((intervalo, indice) => {
        expect(intervalo.superior).toBeGreaterThan(intervalo.inferior);
        if (indice > 0) expect(intervalo.inferior).toBe(intervalos[indice - 1].superior);
      });
    });
  });

  test('toda la muestra cae en algún intervalo de la tabla agrupada (ningún valor se pierde por el redondeo)', () => {
    const valores = [12.6, 13, 500.25, 1643.4, 1643.6, 4906.49, 4906.5, 9800.4];
    const tabla = generarTablaAgrupada(valores, generarIntervalosEquiespaciados(12.6, 9800.4, 6));
    expect(tabla.reduce((total, fila) => total + fila.frecuenciaAbsoluta, 0)).toBe(valores.length);
  });
});

describe('validarNumeroDeIntervalos (RF-39)', () => {
  test.each([2, 5, 10, 30])('acepta %i como válido (entero dentro de [2,30])', (numero) => {
    expect(() => validarNumeroDeIntervalos(numero)).not.toThrow();
  });

  test.each([0, 1, -5, 31, 100, 2.5])('rechaza %s (fuera de [2,30] o no entero)', (numero) => {
    expect(() => validarNumeroDeIntervalos(numero)).toThrow(NumeroDeIntervalosInvalidoError);
  });
});
