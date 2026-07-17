import { compararGrupos } from '../../src/domain/services/ComparadorDeCategorias';

describe('ComparadorDeCategorias', () => {
  test('compara la media y desviación estándar entre dos grupos de CVSS', () => {
    const resultado = compararGrupos([10.0, 10.0, 10.0], [7.8, 7.8, 7.8]);

    expect(resultado.mediaA).toBe(10);
    expect(resultado.mediaB).toBe(7.8);
    expect(resultado.diferenciaMedias).toBe(2.2);
    expect(resultado.sdA).toBe(0);
    expect(resultado.sdB).toBe(0);
  });

  test('compara CVSS de acceso remoto vs local con valores reales del dataset', () => {
    // Remoto: CVE-2021-44228 (Apache Log4j, 10.0), CVE-2021-34527 (Microsoft Windows, 7.8)
    // Local: CVE-2021-35587 (OpenSSL, 9.8), CVE-2021-20021 (Nginx, 5.5)
    const remoto = [10.0, 7.8];
    const local = [9.8, 5.5];

    const resultado = compararGrupos(remoto, local);

    expect(resultado.mediaA).toBe(8.9);
    expect(resultado.mediaB).toBe(7.65);
    expect(resultado.diferenciaMedias).toBe(1.25);
    expect(resultado.sdA).toBeCloseTo(1.5556349186104046, 10);
    expect(resultado.sdB).toBeCloseTo(3.040559159102155, 10);
  });
});
