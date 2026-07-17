import { esVulnerabilidadCritica } from '../../src/domain/services/DetectorDeEventosNotificables';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function vulnerabilidadConCvss(cvss: number): Vulnerabilidad {
  return new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(cvss), 'desc', new TipoAccesoValue('Sí'));
}

describe('DetectorDeEventosNotificables', () => {
  test('CVSS 8.9 NO es notificable como crítica (justo debajo del umbral RF-99)', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(8.9))).toBe(false);
  });

  test('CVSS 9.0 SÍ es notificable como crítica (umbral RF-99 inclusive)', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(9.0))).toBe(true);
  });

  test('CVSS 10.0 es notificable como crítica', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(10.0))).toBe(true);
  });

  test('CVSS bajo/moderado no es notificable como crítica', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(4.0))).toBe(false);
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(0.0))).toBe(false);
  });
});
