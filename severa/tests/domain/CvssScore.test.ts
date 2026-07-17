import { CvssScore } from '../../src/domain/value-objects/CvssScore';

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
});
