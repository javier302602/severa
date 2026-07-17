import nock from 'nock';
import { promises as dnsReal } from 'dns';

jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn()
  }
}));

const dnsLookupMock = dnsReal.lookup as jest.Mock;

import { DescargadorDeArchivosHttp } from '../../src/infrastructure/adapters/out/http/DescargadorDeArchivosHttp';
import { UrlNoPermitidaError } from '../../src/domain/errors/UrlNoPermitidaError';

// IP pública real (Cloudflare DNS) usada solo como "esto es una IP pública
// normal" en los mocks de dns.lookup — nunca se conecta a ella de verdad,
// nock intercepta la petición HTTP antes de que exista un socket real.
const IP_PUBLICA = '1.1.1.1';

function simularDnsPublico() {
  dnsLookupMock.mockResolvedValue([{ address: IP_PUBLICA, family: 4 }]);
}

describe('DescargadorDeArchivosHttp', () => {
  const descargador = new DescargadorDeArchivosHttp();

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    dnsLookupMock.mockReset();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('descarga exitosa: host permitido, IP pública, Content-Type de Excel', async () => {
    simularDnsPublico();
    const contenidoFalso = Buffer.from('contenido-xlsx-falso');
    nock('https://docs.google.com')
      .get('/spreadsheets/d/ID123/export')
      .query({ format: 'xlsx' })
      .reply(200, contenidoFalso, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

    const resultado = await descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx');

    expect(resultado.contenido).toEqual(contenidoFalso);
    expect(dnsLookupMock).toHaveBeenCalledWith('docs.google.com', expect.objectContaining({ all: true }));
  });

  test('sigue una redirección y revalida el nuevo host contra la allowlist', async () => {
    simularDnsPublico();
    const contenidoFalso = Buffer.from('contenido-tras-redireccion');
    nock('https://www.dropbox.com')
      .get('/s/abc/dataset.xlsx')
      .query({ dl: '1' })
      .reply(302, undefined, { Location: 'https://dropbox.com/final/dataset.xlsx' });
    nock('https://dropbox.com')
      .get('/final/dataset.xlsx')
      .reply(200, contenidoFalso, { 'Content-Type': 'application/octet-stream' });

    const resultado = await descargador.descargar('https://www.dropbox.com/s/abc/dataset.xlsx?dl=1');

    expect(resultado.contenido).toEqual(contenidoFalso);
    expect(resultado.urlFinal).toBe('https://dropbox.com/final/dataset.xlsx');
  });

  test('rechaza una redirección hacia un host que NO está en la allowlist, sin llegar a conectarse a él', async () => {
    simularDnsPublico();
    nock('https://docs.google.com')
      .get('/spreadsheets/d/ID123/export')
      .query({ format: 'xlsx' })
      .reply(302, undefined, { Location: 'https://evil.example.com/malware.xlsx' });
    // Deliberadamente SIN interceptor para evil.example.com: si el código
    // intentara conectarse igual, nock (con disableNetConnect) lo bloquearía
    // y la promesa rechazaría por una razón distinta a la esperada,
    // haciendo fallar el test igual — es una prueba negativa real.

    await expect(
      descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx')
    ).rejects.toThrow(UrlNoPermitidaError);
  });

  test('host que nunca estuvo en la allowlist se rechaza ANTES de resolver DNS o conectar', async () => {
    await expect(descargador.descargar('https://evil.example.com/malware.xlsx')).rejects.toThrow(UrlNoPermitidaError);
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  test('IP privada (simulando la resolución DNS de un host permitido) se rechaza antes de conectar', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(
      descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx')
    ).rejects.toThrow(UrlNoPermitidaError);
    // Ningún nock configurado para docs.google.com en este test: si el
    // código llegara a intentar conectarse, nock lo bloquearía de todas
    // formas (disableNetConnect), pero lo correcto es que ni lo intente.
  });

  test('IP de metadata de nube (169.254.169.254, link-local) se rechaza antes de conectar', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    await expect(
      descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx')
    ).rejects.toThrow(UrlNoPermitidaError);
  });

  test('IPv4 mapeada a IPv6 (::ffff:127.0.0.1) también se rechaza — vector de bypass real', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);

    await expect(
      descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx')
    ).rejects.toThrow(UrlNoPermitidaError);
  });

  test('rechaza un archivo que excede el tamaño máximo permitido (5 MB)', async () => {
    simularDnsPublico();
    const contenidoGigante = Buffer.alloc(6 * 1024 * 1024, 'x');
    nock('https://docs.google.com')
      .get('/spreadsheets/d/ID123/export')
      .query({ format: 'xlsx' })
      .reply(200, contenidoGigante, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

    await expect(
      descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx')
    ).rejects.toThrow(/tamaño máximo/);
  });

  test('rechaza contenido cuyo Content-Type/extensión no parece una hoja de cálculo', async () => {
    simularDnsPublico();
    nock('https://www.dropbox.com')
      .get('/s/abc/pagina.html')
      .query({ dl: '1' })
      .reply(200, '<html>no es un dataset</html>', { 'Content-Type': 'text/html' });

    await expect(descargador.descargar('https://www.dropbox.com/s/abc/pagina.html?dl=1')).rejects.toThrow(
      UrlNoPermitidaError
    );
  });

  test('redirección real de export de Google Sheets: docs.google.com -> subdominio de googleusercontent.com se acepta', async () => {
    simularDnsPublico();
    const contenidoFalso = Buffer.from('contenido-xlsx-real-de-google');
    nock('https://docs.google.com')
      .get('/spreadsheets/d/ID123/export')
      .query({ format: 'xlsx' })
      .reply(307, undefined, {
        Location: 'https://doc-08-4o-sheets.googleusercontent.com/export/abc/format=xlsx'
      });
    nock('https://doc-08-4o-sheets.googleusercontent.com')
      .get('/export/abc/format=xlsx')
      .reply(200, contenidoFalso, { 'Content-Type': 'application/octet-stream' });

    const resultado = await descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx');

    expect(resultado.contenido).toEqual(contenidoFalso);
    expect(resultado.urlFinal).toBe('https://doc-08-4o-sheets.googleusercontent.com/export/abc/format=xlsx');
  });

  test('la misma redirección hacia googleusercontent.com se rechaza si el salto anterior NO fue docs.google.com', async () => {
    simularDnsPublico();
    nock('https://www.dropbox.com')
      .get('/s/abc/dataset.xlsx')
      .query({ dl: '1' })
      .reply(302, undefined, {
        Location: 'https://doc-08-4o-sheets.googleusercontent.com/export/abc/format=xlsx'
      });
    // Deliberadamente SIN interceptor para googleusercontent.com: si el
    // código llegara a intentar conectarse, nock (con disableNetConnect) lo
    // bloquearía igual, pero lo correcto es que ni lo intente porque el
    // salto anterior fue www.dropbox.com, no docs.google.com.

    await expect(
      descargador.descargar('https://www.dropbox.com/s/abc/dataset.xlsx?dl=1')
    ).rejects.toThrow(UrlNoPermitidaError);
  });

  test('rechaza tras superar el máximo de redirecciones (posible loop de redirects)', async () => {
    simularDnsPublico();
    nock('https://docs.google.com').get('/a').times(1).reply(302, undefined, { Location: 'https://docs.google.com/b' });
    nock('https://docs.google.com').get('/b').times(1).reply(302, undefined, { Location: 'https://docs.google.com/c' });
    nock('https://docs.google.com').get('/c').times(1).reply(302, undefined, { Location: 'https://docs.google.com/d' });
    nock('https://docs.google.com').get('/d').times(1).reply(302, undefined, { Location: 'https://docs.google.com/e' });

    await expect(descargador.descargar('https://docs.google.com/a')).rejects.toThrow(/redireccion/i);
  });
});
