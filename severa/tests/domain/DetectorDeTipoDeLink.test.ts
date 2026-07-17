import {
  detectarTipoDeLink,
  esHostPermitido,
  esHostPermitidoComoRedireccion
} from '../../src/domain/services/DetectorDeTipoDeLink';

describe('DetectorDeTipoDeLink', () => {
  describe('NVD', () => {
    test('nvd.nist.gov clasifica como nvd', () => {
      expect(detectarTipoDeLink('https://nvd.nist.gov/vuln/detail/CVE-2021-44228')).toEqual({ tipo: 'nvd' });
    });

    test('api.nvd.nist.gov clasifica como nvd', () => {
      expect(detectarTipoDeLink('https://api.nvd.nist.gov/rest/json/cves/2.0')).toEqual({ tipo: 'nvd' });
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

    test('un path de docs.google.com que no es /spreadsheets/d/... cae en "directo", host confiable pero sin reescritura', () => {
      const resultado = detectarTipoDeLink('https://docs.google.com/document/d/ID123/edit');
      expect(resultado.tipo).toBe('directo');
      expect(resultado.urlDescargable).toBe('https://docs.google.com/document/d/ID123/edit');
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

  describe('Hosts no permitidos (deny-by-default)', () => {
    test('un host arbitrario se rechaza explícitamente, con el host en el motivo', () => {
      const resultado = detectarTipoDeLink('https://evil.example.com/malware.xlsx');
      expect(resultado.tipo).toBe('noPermitido');
      expect(resultado.motivoRechazo).toContain('evil.example.com');
    });

    test('bypass clásico por subdominio ("nvd.nist.gov.evil.com") se rechaza — comparación exacta, no substring', () => {
      const resultado = detectarTipoDeLink('https://nvd.nist.gov.evil.com/x.xlsx');
      expect(resultado.tipo).toBe('noPermitido');
    });

    test('bypass clásico por prefijo ("evil-nvd.nist.gov") se rechaza', () => {
      const resultado = detectarTipoDeLink('https://evil-nvd.nist.gov/x.xlsx');
      expect(resultado.tipo).toBe('noPermitido');
    });

    test('bypass clásico por userinfo ("nvd.nist.gov@evil.com") se rechaza — el host real es evil.com', () => {
      const resultado = detectarTipoDeLink('https://nvd.nist.gov@evil.com/x.xlsx');
      expect(resultado.tipo).toBe('noPermitido');
      expect(resultado.motivoRechazo).toContain('evil.com');
    });

    test('esquema http (no https) se rechaza incluso contra un host permitido', () => {
      const resultado = detectarTipoDeLink('http://nvd.nist.gov/vuln/detail/CVE-2021-44228');
      expect(resultado.tipo).toBe('noPermitido');
      expect(resultado.motivoRechazo).toContain('https');
    });

    test('un IP literal (intento directo de SSRF) se rechaza por no estar en la allowlist de hosts', () => {
      const resultado = detectarTipoDeLink('https://169.254.169.254/latest/meta-data/');
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

  describe('esHostPermitido (reutilizado por DescargadorDeArchivosHttp para revalidar redirecciones)', () => {
    test.each([
      ['nvd.nist.gov', true],
      ['api.nvd.nist.gov', true],
      ['docs.google.com', true],
      ['www.dropbox.com', true],
      ['dropbox.com', true],
      ['services.nvd.nist.gov', false],
      ['evil.example.com', false],
      ['nvd.nist.gov.evil.com', false]
    ])('%s -> %s', (host, esperado) => {
      expect(esHostPermitido(host)).toBe(esperado);
    });
  });

  describe('esHostPermitidoComoRedireccion (caso especial acotado: export de Google Sheets)', () => {
    test('redirección desde docs.google.com hacia un subdominio de googleusercontent.com se acepta', () => {
      expect(esHostPermitidoComoRedireccion('doc-08-4o-sheets.googleusercontent.com', 'docs.google.com')).toBe(true);
    });

    test('la misma redirección SIN haber pasado antes por docs.google.com se rechaza', () => {
      expect(esHostPermitidoComoRedireccion('doc-08-4o-sheets.googleusercontent.com', null)).toBe(false);
      expect(esHostPermitidoComoRedireccion('doc-08-4o-sheets.googleusercontent.com', 'www.dropbox.com')).toBe(false);
      expect(esHostPermitidoComoRedireccion('doc-08-4o-sheets.googleusercontent.com', 'evil.example.com')).toBe(false);
    });

    test('un googleusercontent.com encadenado (redirección de una redirección) también se rechaza', () => {
      expect(
        esHostPermitidoComoRedireccion('otro-subdominio.googleusercontent.com', 'doc-08-4o-sheets.googleusercontent.com')
      ).toBe(false);
    });

    test('el dominio exacto "googleusercontent.com" (sin subdominio) no se acepta — no es el patrón real observado', () => {
      expect(esHostPermitidoComoRedireccion('googleusercontent.com', 'docs.google.com')).toBe(false);
    });

    test('un host que ya está en la allowlist normal se sigue aceptando sin importar el salto anterior', () => {
      expect(esHostPermitidoComoRedireccion('www.dropbox.com', null)).toBe(true);
      expect(esHostPermitidoComoRedireccion('docs.google.com', 'nvd.nist.gov')).toBe(true);
    });

    test('bypass por substring ("evilgoogleusercontent.com") se rechaza — se exige el separador de subdominio', () => {
      expect(esHostPermitidoComoRedireccion('evilgoogleusercontent.com', 'docs.google.com')).toBe(false);
    });
  });
});
