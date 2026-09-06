import { IdentificadorCVE } from '../../../../src/domain/shared/value-objects/IdentificadorCVE';

describe('IdentificadorCVE value object', () => {
  test('valid CVE format', () => {
    expect(() => new IdentificadorCVE('CVE-2026-12345')).not.toThrow();
  });

  test('invalid CVE format', () => {
    expect(() => new IdentificadorCVE('CVE-26-1')).toThrow();
  });
});
