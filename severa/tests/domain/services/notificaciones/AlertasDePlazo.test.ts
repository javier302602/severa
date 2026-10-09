import {
  MAXIMO_DE_ALERTAS_INDIVIDUALES,
  convieneResumirAlertas,
  redactarResumenDeAlertasDePlazo
} from '../../../../src/domain/services/notificaciones/AlertasDePlazo';
import { Vulnerabilidad } from '../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../src/domain/shared/value-objects/TipoAcceso';

function vulnerabilidad(cve: string, cvss: number): Vulnerabilidad {
  return new Vulnerabilidad(cve, new IdentificadorCVE(cve), new CvssScore(cvss), 'Software', new TipoAccesoValue('Sí'));
}

// RF-76 y RF-100: cuándo conviene un resumen en vez de una notificación por
// vulnerabilidad, y qué dice ese resumen.
describe('AlertasDePlazo', () => {
  test(`hasta ${MAXIMO_DE_ALERTAS_INDIVIDUALES} se avisa de cada una; a partir de ahí conviene un resumen`, () => {
    expect(convieneResumirAlertas(0)).toBe(false);
    expect(convieneResumirAlertas(1)).toBe(false);
    expect(convieneResumirAlertas(MAXIMO_DE_ALERTAS_INDIVIDUALES)).toBe(false);
    expect(convieneResumirAlertas(MAXIMO_DE_ALERTAS_INDIVIDUALES + 1)).toBe(true);
    expect(convieneResumirAlertas(100_000)).toBe(true);
  });

  test('el resumen dice cuántas son, nombra las tres de mayor CVSS y cuenta el resto', () => {
    const mensaje = redactarResumenDeAlertasDePlazo('PlazoVencido', [
      vulnerabilidad('CVE-2021-0001', 5.5),
      vulnerabilidad('CVE-2021-0002', 9.8),
      vulnerabilidad('CVE-2021-0003', 7.5),
      vulnerabilidad('CVE-2021-0004', 10),
      vulnerabilidad('CVE-2021-0005', 3.1),
      vulnerabilidad('CVE-2021-0006', 6.0)
    ]);

    expect(mensaje).toBe(
      'Plazo de remediación excedido en 6 vulnerabilidades: CVE-2021-0004 (CVSS 10), CVE-2021-0002 (CVSS 9.8), CVE-2021-0003 (CVSS 7.5) y 3 más. El detalle está en Priorización.'
    );
  });

  test('el de "próximo a vencer" lo dice en futuro, para no confundirse con el de "vencido"', () => {
    const mensaje = redactarResumenDeAlertasDePlazo(
      'PlazoProximoAVencer',
      Array.from({ length: 8 }, (_, i) => vulnerabilidad(`CVE-2022-000${i}`, 9))
    );

    expect(mensaje).toMatch(/^Plazo de remediación próximo a vencer \(dentro de 48hs\) en 8 vulnerabilidades: /);
    expect(mensaje).not.toMatch(/excedido/);
  });

  test('a igual CVSS ordena por CVE: el texto no depende del orden en que llegaron', () => {
    const a = vulnerabilidad('CVE-2021-0001', 9);
    const b = vulnerabilidad('CVE-2021-0002', 9);
    const c = vulnerabilidad('CVE-2021-0003', 9);
    const d = vulnerabilidad('CVE-2021-0004', 9);

    expect(redactarResumenDeAlertasDePlazo('PlazoVencido', [d, b, a, c])).toBe(redactarResumenDeAlertasDePlazo('PlazoVencido', [a, b, c, d]));
    expect(redactarResumenDeAlertasDePlazo('PlazoVencido', [d, b, a, c])).toContain('CVE-2021-0001 (CVSS 9), CVE-2021-0002 (CVSS 9), CVE-2021-0003 (CVSS 9) y 1 más');
  });

  test('con tres o menos no agrega "y N más"', () => {
    const mensaje = redactarResumenDeAlertasDePlazo('PlazoVencido', [vulnerabilidad('CVE-2021-0001', 9), vulnerabilidad('CVE-2021-0002', 8)]);

    expect(mensaje).toBe('Plazo de remediación excedido en 2 vulnerabilidades: CVE-2021-0001 (CVSS 9), CVE-2021-0002 (CVSS 8). El detalle está en Priorización.');
  });

  test('no modifica la lista que recibe', () => {
    const lista = [vulnerabilidad('CVE-2021-0001', 1), vulnerabilidad('CVE-2021-0002', 9)];

    redactarResumenDeAlertasDePlazo('PlazoVencido', lista);

    expect(lista.map((v) => v.cve.valor)).toEqual(['CVE-2021-0001', 'CVE-2021-0002']);
  });
});
