import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';

describe('CvssScore value object', () => {
  test('0.0 is valid', () => {
    expect(() => new CvssScore(0.0)).not.toThrow();
  });

  test('10.0 is valid', () => {
    expect(() => new CvssScore(10.0)).not.toThrow();
  });

  test('10.1 is invalid', () => {
    expect(() => new CvssScore(10.1)).toThrow();
  });

  test('-0.1 is invalid', () => {
    expect(() => new CvssScore(-0.1)).toThrow();
  });

  test('7.5 is valid', () => {
    expect(() => new CvssScore(7.5)).not.toThrow();
  });

  // RF-28 / RF-69 + defecto del 8.95: al importar se redondea igual que la
  // base (NUMERIC(3,1): un decimal, la mitad hacia arriba, sobre el valor
  // decimal). Si no, lo que se clasifica al importar no es lo que se guarda.
  describe('redondeado — como lo guarda PostgreSQL', () => {
    test.each([
      [3.95, 4.0],
      [6.95, 7.0],
      [8.95, 9.0],
      [8.94, 8.9],
      [8.949, 8.9],
      [0.05, 0.1],
      [9.96, 10.0],
      [7.5, 7.5],
      [10, 10],
      [0, 0]
    ])('%s se guarda como %s', (crudo, guardado) => {
      expect(CvssScore.redondeado(crudo).valor).toBe(guardado);
    });

    test('todo valor terminado en 5 (0.05 a 9.95) sube a la décima siguiente, como en PostgreSQL', () => {
      for (let decimas = 0; decimas < 100; decimas++) {
        const crudo = Number(((decimas + 0.5) / 10).toFixed(2));
        expect(CvssScore.redondeado(crudo).valor).toBe((decimas + 1) / 10);
      }
    });

    test('lo que queda fuera de 0-10 después de redondear se sigue rechazando', () => {
      expect(() => CvssScore.redondeado(10.05)).toThrow();
      expect(() => CvssScore.redondeado(Number.NaN)).toThrow();
    });
  });
});

