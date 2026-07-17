import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('Vulnerabilidad entity', () => {
  test('creates with valid value objects', () => {
    const v = new Vulnerabilidad(
      '1',
      new IdentificadorCVE('CVE-2026-12345'),
      new CvssScore(7.8),
      'Some description',
      new TipoAccesoValue('remoto')
    );

    expect(v.cve.valor).toBe('CVE-2026-12345');
    expect(v.cvssScore.valor).toBe(7.8);
    expect(v.tipoAcceso?.valor).toBe('Remoto');
  });

  test('creation fails with invalid CvssScore', () => {
    expect(() => new Vulnerabilidad('1', new IdentificadorCVE('CVE-2026-12345'), new CvssScore(11), 'x')).toThrow();
  });
});
