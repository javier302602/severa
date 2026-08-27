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

  // Bug real reproducido en vivo (2026-07-19): antes esto tiraba
  // ValorEstadisticoError ("La lista de CVSS Score no puede estar vacía")
  // apenas UN grupo estaba vacío — confirmado contra /comparacion/software
  // real (categoría sin ninguna vulnerabilidad) y contra
  // GenerarInforme/GenerarResumenEjecutivo (catálogo sin ninguna
  // vulnerabilidad de acceso Local). Ahora ese lado queda en null, sin
  // romper la comparación completa.
  describe('con un grupo vacío (bug real: rompía TODA la comparación)', () => {
    test('grupo B vacío: mediaA/sdA reales, mediaB/sdB/diferenciaMedias en null, no tira', () => {
      expect(() => compararGrupos([10.0, 9.5], [])).not.toThrow();

      const resultado = compararGrupos([10.0, 9.5], []);
      expect(resultado.mediaA).toBe(9.75);
      expect(resultado.sdA).toBeCloseTo(0.3535533905932738, 10);
      expect(resultado.mediaB).toBeNull();
      expect(resultado.sdB).toBeNull();
      expect(resultado.diferenciaMedias).toBeNull();
    });

    test('ambos grupos vacíos: todo en null, no tira', () => {
      const resultado = compararGrupos([], []);
      expect(resultado).toEqual({ mediaA: null, mediaB: null, diferenciaMedias: null, sdA: null, sdB: null });
    });

    test('grupo con un solo valor: mediaA se puede calcular pero sdA queda en null (desviación muestral necesita al menos 2)', () => {
      const resultado = compararGrupos([7.5], [5.0, 6.0]);
      expect(resultado.mediaA).toBe(7.5);
      expect(resultado.sdA).toBeNull();
      expect(resultado.mediaB).toBe(5.5);
      expect(resultado.sdB).not.toBeNull();
    });
  });
});
