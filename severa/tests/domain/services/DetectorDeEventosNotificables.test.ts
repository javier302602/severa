import { criterioDeCriticas, esVulnerabilidadCritica } from '../../../src/domain/services/DetectorDeEventosNotificables';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';

// Sin umbral propio, la regla es el corte de Crítico de la escala (con CVSS, 9.0).
const UMBRAL_CVSS = criterioDeCriticas(null, EscalaDeClasificacion.CVSS).umbral;
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';

function vulnerabilidadConCvss(cvss: number): Vulnerabilidad {
  return new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(cvss), 'desc', new TipoAccesoValue('Sí'));
}

describe('DetectorDeEventosNotificables', () => {
  test('CVSS 8.9 NO es notificable como crítica (justo debajo del umbral RF-99)', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(8.9), UMBRAL_CVSS)).toBe(false);
  });

  test('CVSS 9.0 SÍ es notificable como crítica (umbral RF-99 inclusive)', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(9.0), UMBRAL_CVSS)).toBe(true);
  });

  test('CVSS 10.0 es notificable como crítica', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(10.0), UMBRAL_CVSS)).toBe(true);
  });

  test('CVSS bajo/moderado no es notificable como crítica', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(4.0), UMBRAL_CVSS)).toBe(false);
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(0.0), UMBRAL_CVSS)).toBe(false);
  });

  // RF-99 (M-13, retoma): umbral configurable — los 4 tests de arriba quedan
  // intactos (verifican el default sin segundo argumento); estos cubren el
  // umbral explícito.
  test('con umbral explícito sobre diasParaParche, evalúa esa variable en vez de cvssScore', () => {
    const conDiasParaParche = new Vulnerabilidad(
      '1',
      new IdentificadorCVE('CVE-2024-00002'),
      new CvssScore(3.0),
      'desc',
      new TipoAccesoValue('No'),
      30
    );
    expect(esVulnerabilidadCritica(conDiasParaParche, { variable: 'diasParaParche', valor: 30 })).toBe(true);
    expect(esVulnerabilidadCritica(conDiasParaParche, { variable: 'diasParaParche', valor: 31 })).toBe(false);
  });

  test('con umbral explícito sobre cvssScore, el límite deja de ser 9.0', () => {
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(5.0), { variable: 'cvssScore', valor: 5.0 })).toBe(true);
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(4.9), { variable: 'cvssScore', valor: 5.0 })).toBe(false);
    // Con el umbral configurado, 9.0 (el default de siempre) ya NO es especial.
    expect(esVulnerabilidadCritica(vulnerabilidadConCvss(9.0), { variable: 'cvssScore', valor: 9.5 })).toBe(false);
  });

  test('diasParaParche sin dato (undefined) nunca es crítico contra ese umbral', () => {
    const sinDiasParaParche = vulnerabilidadConCvss(10.0);
    expect(esVulnerabilidadCritica(sinDiasParaParche, { variable: 'diasParaParche', valor: 0 })).toBe(false);
  });

  describe('criterioDeCriticas — RF-99 + RF-28/RF-69', () => {
    const propia = EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 });

    test('sin umbral propio usa el corte de Crítico de la escala, y lo dice', () => {
      expect(criterioDeCriticas(null, EscalaDeClasificacion.CVSS)).toEqual({
        umbral: { variable: 'cvssScore', valor: 9 },
        origen: 'escala',
        descripcion: 'según el corte de Crítico de tu escala: CVSS desde 9.0'
      });
      const conPropia = criterioDeCriticas(null, propia);
      expect(conPropia.umbral).toEqual({ variable: 'cvssScore', valor: 8.5 });
      expect(esVulnerabilidadCritica(vulnerabilidadConCvss(8.7), conPropia.umbral)).toBe(true);
    });

    test('con umbral propio se respeta (aunque la escala diga otra cosa), y lo dice', () => {
      const conUmbral = criterioDeCriticas({ variable: 'cvssScore', valor: 9.5 }, propia);

      expect(conUmbral.origen).toBe('umbral-propio');
      expect(conUmbral.descripcion).toBe('según tu umbral de alerta: CVSS desde 9.5');
      expect(esVulnerabilidadCritica(vulnerabilidadConCvss(8.7), conUmbral.umbral)).toBe(false);
      expect(criterioDeCriticas({ variable: 'diasParaParche', valor: 30 }, propia).descripcion).toBe('según tu umbral de alerta: días para parche desde 30');
    });
  });
});
