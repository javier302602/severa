import { detectarTipoDeLink } from '../../src/domain/services/DetectorDeTipoDeLink';

describe('DetectorDeTipoDeLink', () => {
  describe('NVD', () => {
    test('nvd.nist.gov clasifica como nvd y conserva la URL exacta pegada', () => {
      expect(detectarTipoDeLink('https://nvd.nist.gov/vuln/detail/CVE-2021-44228')).toEqual({
        tipo: 'nvd',
        urlDescargable: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228'
      });
    });

    test('api.nvd.nist.gov clasifica como nvd y conserva la URL exacta pegada', () => {
      expect(detectarTipoDeLink('https://api.nvd.nist.gov/rest/json/cves/2.0')).toEqual({
        tipo: 'nvd',
        urlDescargable: 'https://api.nvd.nist.gov/rest/json/cves/2.0'
      });
    });

    test('services.nvd.nist.gov (host real de la API pública NVD 2.0) clasifica como nvd y conserva la URL EXACTA pegada, con sus query params', () => {
      const url = 'https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=2024-01-01T00:00:00.000&pubEndDate=2024-01-02T00:00:00.000';
      expect(detectarTipoDeLink(url)).toEqual({ tipo: 'nvd', urlDescargable: url });
    });
  });

  describe('Google Sheets', () => {
    test('link de compartir estándar se reescribe a export?format=xlsx', () => {
      const resultado = detectarTipoDeLink('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0');
      expect(resultado).toEqual({
        tipo: 'googleSheets',
        urlDescargable: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/export?format=xlsx'
      });
    });

    test('link sin fragmento ni query también se reescribe', () => {
      const resultado = detectarTipoDeLink('https://docs.google.com/spreadsheets/d/ID123');
      expect(resultado.urlDescargable).toBe('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx');
    });

    test('un path de docs.google.com que no es /spreadsheets/d/... cae en "directo", sin reescritura', () => {
      const resultado = detectarTipoDeLink('https://docs.google.com/document/d/ID123/edit');
      expect(resultado.tipo).toBe('directo');
      expect(resultado.urlDescargable).toBe('https://docs.google.com/document/d/ID123/edit');
    });

    // Cuidado especial pedido explícitamente: storage.googleapis.com es
    // Google Cloud Storage, NO Google Sheets — comparten organización pero
    // son productos completamente distintos. La reescritura a
    // export?format=xlsx es EXCLUSIVA de docs.google.com por comparación
    // exacta de host, nunca por "termina en .google.com" o similar.
    test('storage.googleapis.com (Google Cloud Storage, NO Sheets) NUNCA se transforma como si fuera Sheets', () => {
      const urlFirmada =
        'https://storage.googleapis.com/kagglesdsdata/datasets/6129413/18111744/cve_cisa_epss_enriched_dataset.csv?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc123';
      const resultado = detectarTipoDeLink(urlFirmada);

      expect(resultado.tipo).toBe('directo');
      expect(resultado.urlDescargable).toBe(urlFirmada);
      expect(resultado.urlDescargable).not.toContain('export?format=xlsx');
    });
  });

  describe('Dropbox', () => {
    test('link de compartir con ?dl=0 se reescribe a dl=1', () => {
      const resultado = detectarTipoDeLink('https://www.dropbox.com/s/abc123/dataset.xlsx?dl=0');
      expect(resultado).toEqual({
        tipo: 'dropbox',
        urlDescargable: 'https://www.dropbox.com/s/abc123/dataset.xlsx?dl=1'
      });
    });

    test('dropbox.com sin "www" también se reconoce', () => {
      const resultado = detectarTipoDeLink('https://dropbox.com/s/abc123/dataset.xlsx?dl=0');
      expect(resultado.tipo).toBe('dropbox');
    });

    test('link sin parámetro dl le agrega dl=1', () => {
      const resultado = detectarTipoDeLink('https://www.dropbox.com/s/abc123/dataset.xlsx');
      expect(resultado.urlDescargable).toBe('https://www.dropbox.com/s/abc123/dataset.xlsx?dl=1');
    });

    test('link que ya tiene dl=1 se mantiene en dl=1 (idempotente)', () => {
      const resultado = detectarTipoDeLink('https://www.dropbox.com/s/abc123/dataset.xlsx?dl=1');
      expect(resultado.urlDescargable).toBe('https://www.dropbox.com/s/abc123/dataset.xlsx?dl=1');
    });
  });

  // Cambio de diseño (2026-07-17): la allowlist de hosts específicos se
  // eliminó como filtro de entrada. Cualquier host https que no sea NVD/
  // Sheets/Dropbox ahora es 'directo' — la protección real contra SSRF vive
  // en DescargadorDeArchivosHttp (DNS + IP pública en cada salto), no acá.
  describe('Cualquier host público (ya no hay allowlist de entrada)', () => {
    test('un host arbitrario, nunca antes visto, se acepta como "directo"', () => {
      const resultado = detectarTipoDeLink('https://ejemplo-cualquiera.com/dataset.csv');
      expect(resultado.tipo).toBe('directo');
      expect(resultado.urlDescargable).toBe('https://ejemplo-cualquiera.com/dataset.csv');
    });

    test('lo que antes era un bypass de allowlist ("nvd.nist.gov.evil.com") ahora simplemente se acepta como "directo" — ya no hay allowlist que eludir', () => {
      const resultado = detectarTipoDeLink('https://nvd.nist.gov.evil.com/x.csv');
      expect(resultado.tipo).toBe('directo');
    });

    // Crítico: la query string de una URL firmada (Google Cloud Storage,
    // S3, etc.) debe llegar carácter por carácter igual — cualquier
    // reconstrucción rompe la firma.
    test('la query string de una URL firmada se preserva EXACTA, sin reordenar ni recodificar ningún parámetro', () => {
      const urlFirmada =
        'https://storage.googleapis.com/kagglesdsdata/datasets/6129413/18111744/cve_cisa_epss_enriched_dataset.csv' +
        '?X-Goog-Algorithm=GOOG4-RSA-SHA256' +
        '&X-Goog-Credential=gcp-kaggle-com%40kaggle-161607.iam.gserviceaccount.com%2F20260717%2Fauto%2Fstorage%2Fgoog4_request' +
        '&X-Goog-Date=20260717T135525Z' +
        '&X-Goog-Expires=259200' +
        '&X-Goog-SignedHeaders=host' +
        '&X-Goog-Signature=7d66e11c8cdd354a4602f8737b645478e93cfcf0bad2be08af1264c0cc1dea3';

      const resultado = detectarTipoDeLink(urlFirmada);

      expect(resultado.tipo).toBe('directo');
      expect(resultado.urlDescargable).toBe(urlFirmada);
    });

    test('un IP literal (intento directo de SSRF) ya NO se rechaza en esta capa — queda a cargo de DescargadorDeArchivosHttp', () => {
      const resultado = detectarTipoDeLink('https://169.254.169.254/latest/meta-data/');
      expect(resultado.tipo).toBe('directo');
    });
  });

  describe('Lo que sigue rechazándose (no relacionado con la allowlist)', () => {
    test('esquema http (no https) se rechaza incluso contra un host que sería válido', () => {
      const resultado = detectarTipoDeLink('http://ejemplo-cualquiera.com/dataset.csv');
      expect(resultado.tipo).toBe('noPermitido');
      expect(resultado.motivoRechazo).toContain('https');
    });

    test('esquema http se rechaza también contra un host de NVD', () => {
      const resultado = detectarTipoDeLink('http://nvd.nist.gov/vuln/detail/CVE-2021-44228');
      expect(resultado.tipo).toBe('noPermitido');
    });
  });

  describe('URLs malformadas', () => {
    test('un string que no es una URL válida se rechaza con motivo específico', () => {
      const resultado = detectarTipoDeLink('esto no es una url');
      expect(resultado.tipo).toBe('noPermitido');
      expect(resultado.motivoRechazo).toBe('URL malformada');
    });

    test('string vacío se rechaza', () => {
      expect(detectarTipoDeLink('').tipo).toBe('noPermitido');
    });
  });
});
