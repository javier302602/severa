import { calcularCorrelacionPearson } from '../../src/domain/services/Correlacion';
import { ValorEstadisticoError } from '../../src/domain/errors/ValorEstadisticoError';

describe('Correlacion', () => {
  test('correlación perfecta positiva (y = x) da 1', () => {
    const r = calcularCorrelacionPearson([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 }
    ]);
    expect(r).toBeCloseTo(1, 10);
  });

  test('correlación perfecta negativa (y = -x) da -1', () => {
    const r = calcularCorrelacionPearson([
      { x: 1, y: 4 },
      { x: 2, y: 3 },
      { x: 3, y: 2 },
      { x: 4, y: 1 }
    ]);
    expect(r).toBeCloseTo(-1, 10);
  });

  test('sin ninguna relación lineal, la correlación es cercana a 0', () => {
    const r = calcularCorrelacionPearson([
      { x: 1, y: 5 },
      { x: 2, y: 1 },
      { x: 3, y: 8 },
      { x: 4, y: 2 },
      { x: 5, y: 6 }
    ]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  test('si todos los X son idénticos, devuelve 0 en vez de NaN (división por cero)', () => {
    const r = calcularCorrelacionPearson([
      { x: 5, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 3 }
    ]);
    expect(r).toBe(0);
  });

  test('rechaza menos de dos pares', () => {
    expect(() => calcularCorrelacionPearson([{ x: 1, y: 1 }])).toThrow(ValorEstadisticoError);
  });
});
