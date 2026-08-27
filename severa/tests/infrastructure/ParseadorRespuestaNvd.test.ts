import { parsearRespuestaNvd } from '../../src/infrastructure/adapters/out/nvd/ParseadorRespuestaNvd';

function itemNvd(overrides: Record<string, unknown> = {}) {
  return {
    cve: {
      id: 'CVE-2024-00001',
      descriptions: [{ lang: 'en', value: 'Descripción de prueba' }],
      metrics: {
        cvssMetricV31: [{ cvssData: { baseScore: 9.8, attackVector: 'NETWORK' } }]
      },
      weaknesses: [{ description: [{ lang: 'en', value: 'CWE-79' }] }],
      ...overrides
    }
  };
}

describe('parsearRespuestaNvd', () => {
  test('parsea un item real de NVD 2.0 (CVSS v3.1, attackVector NETWORK) a una Vulnerabilidad importable', () => {
    const resultado = parsearRespuestaNvd({ vulnerabilities: [itemNvd()] });

    expect(resultado.rechazadas).toEqual([]);
    expect(resultado.importables).toHaveLength(1);
    const { vulnerabilidad } = resultado.importables[0];
    expect(vulnerabilidad.cve.valor).toBe('CVE-2024-00001');
    expect(vulnerabilidad.cvssScore.valor).toBe(9.8);
    expect(vulnerabilidad.tipoAcceso?.valor).toBe('Remoto');
    expect(vulnerabilidad.descripcion).toBe('Descripción de prueba');
    expect(vulnerabilidad.tipoVulnerabilidad).toBe('CWE-79');
  });

  test('attackVector LOCAL (o accessVector de CVSS v2) se clasifica como Local', () => {
    const resultado = parsearRespuestaNvd({
      vulnerabilities: [
        itemNvd({ metrics: { cvssMetricV2: [{ cvssData: { baseScore: 4.3, accessVector: 'LOCAL' } }] } })
      ]
    });

    expect(resultado.importables[0].vulnerabilidad.tipoAcceso?.valor).toBe('Local');
  });

  test('usa cvssMetricV30 si no hay v31, y cvssMetricV2 solo como último fallback', () => {
    const resultado = parsearRespuestaNvd({
      vulnerabilities: [itemNvd({ metrics: { cvssMetricV30: [{ cvssData: { baseScore: 6.5, attackVector: 'NETWORK' } }] } })]
    });

    expect(resultado.importables[0].vulnerabilidad.cvssScore.valor).toBe(6.5);
  });

  test('un CVE sin ninguna métrica CVSS publicada se rechaza en vez de romper el parseo completo', () => {
    const resultado = parsearRespuestaNvd({
      vulnerabilities: [itemNvd({ metrics: {} }), itemNvd()]
    });

    expect(resultado.rechazadas).toHaveLength(1);
    expect(resultado.rechazadas[0].error).toContain('CVE-2024-00001');
    expect(resultado.importables).toHaveLength(1);
  });

  test('respuesta sin vulnerabilities (vacía) no rompe, devuelve listas vacías', () => {
    expect(parsearRespuestaNvd({})).toEqual({ importables: [], rechazadas: [] });
    expect(parsearRespuestaNvd({ vulnerabilities: [] })).toEqual({ importables: [], rechazadas: [] });
  });

  test('sin descripción en inglés, cae al primer idioma disponible', () => {
    const resultado = parsearRespuestaNvd({
      vulnerabilities: [itemNvd({ descriptions: [{ lang: 'es', value: 'Solo en español' }] })]
    });

    expect(resultado.importables[0].vulnerabilidad.descripcion).toBe('Solo en español');
  });
});
