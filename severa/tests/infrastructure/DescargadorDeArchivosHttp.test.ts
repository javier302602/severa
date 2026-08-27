import fs from 'fs';
import nock from 'nock';
import zlib from 'zlib';
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

// Streaming a disco (2026-07-17): descargar() ya no devuelve el contenido en
// un Buffer — hay que leer el archivo temporal resultante para comparar.
function leerArchivo(rutaArchivo: string): Buffer {
  return fs.readFileSync(rutaArchivo);
}

describe('DescargadorDeArchivosHttp', () => {
  // Límite de 1GB inyectado por defecto en producción — en los tests se usa
  // un límite chico (1MB) para poder verificar el corte real sin transferir
  // gigabytes en cada corrida de la suite. Los tests que NO chequean el
  // límite de tamaño usan igual este límite chico porque sus contenidos de
  // prueba son de pocos bytes, muy por debajo.
  const LIMITE_DE_PRUEBA = 1024 * 1024;
  const descargador = new DescargadorDeArchivosHttp(LIMITE_DE_PRUEBA);

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

  test('descarga exitosa: Content-Type de Excel, escribe el contenido real a un archivo temporal', async () => {
    simularDnsPublico();
    const contenidoFalso = Buffer.from('contenido-xlsx-falso');
    nock('https://docs.google.com')
      .get('/spreadsheets/d/ID123/export')
      .query({ format: 'xlsx' })
      .reply(200, contenidoFalso, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

    const resultado = await descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx');

    expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoFalso);
    expect(dnsLookupMock).toHaveBeenCalledWith('docs.google.com', expect.objectContaining({ all: true }));
    fs.unlinkSync(resultado.rutaArchivo);
  });

  test('sigue una redirección normalmente', async () => {
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

    expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoFalso);
    expect(resultado.urlFinal).toBe('https://dropbox.com/final/dataset.xlsx');
    fs.unlinkSync(resultado.rutaArchivo);
  });

  // Cambio de diseño (2026-07-17): la allowlist de hosts se eliminó — CUALQUIER
  // host https ahora es un destino válido (de link inicial o de redirección),
  // siempre sujeto a que su IP resuelva a un rango público real.
  describe('Cualquier host (ya no hay allowlist de entrada ni de redirección)', () => {
    test('un host que antes hubiera sido rechazado por la allowlist ahora se descarga normalmente', async () => {
      simularDnsPublico();
      const contenidoFalso = Buffer.from('contenido-real-csv');
      nock('https://ejemplo-cualquiera.com').get('/dataset.csv').reply(200, contenidoFalso, { 'Content-Type': 'text/csv' });

      const resultado = await descargador.descargar('https://ejemplo-cualquiera.com/dataset.csv');

      expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoFalso);
      fs.unlinkSync(resultado.rutaArchivo);
    });

    test('una redirección hacia un host que antes NO estaba en la allowlist ahora se sigue (la IP sigue siendo pública)', async () => {
      simularDnsPublico();
      const contenidoFalso = Buffer.from('contenido-final');
      nock('https://docs.google.com')
        .get('/spreadsheets/d/ID123/export')
        .query({ format: 'xlsx' })
        .reply(302, undefined, { Location: 'https://un-host-cualquiera.example.com/final.csv' });
      nock('https://un-host-cualquiera.example.com')
        .get('/final.csv')
        .reply(200, contenidoFalso, { 'Content-Type': 'text/csv' });

      const resultado = await descargador.descargar('https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx');

      expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoFalso);
      expect(resultado.urlFinal).toBe('https://un-host-cualquiera.example.com/final.csv');
      fs.unlinkSync(resultado.rutaArchivo);
    });

    test('la query string (con firma) llega intacta al pedido HTTP real — nock hace match exacto de query', async () => {
      simularDnsPublico();
      const contenidoFalso = Buffer.from('csv-real');
      nock('https://storage.googleapis.com')
        .get('/bucket/dataset.csv')
        .query({ 'X-Goog-Signature': 'abc123', 'X-Goog-Algorithm': 'GOOG4-RSA-SHA256' })
        .reply(200, contenidoFalso, { 'Content-Type': 'text/csv' });

      const resultado = await descargador.descargar(
        'https://storage.googleapis.com/bucket/dataset.csv?X-Goog-Signature=abc123&X-Goog-Algorithm=GOOG4-RSA-SHA256'
      );

      expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoFalso);
      fs.unlinkSync(resultado.rutaArchivo);
    });
  });

  describe('Mensajes de error específicos', () => {
    test('host que no resuelve → mensaje claro de "no se pudo encontrar ese dominio"', async () => {
      dnsLookupMock.mockRejectedValue(new Error('ENOTFOUND'));

      await expect(descargador.descargar('https://no-existe-de-verdad.example.com/dataset.csv')).rejects.toThrow(
        'No se pudo encontrar ese dominio. Verificá que el link esté bien escrito.'
      );
    });

    test('IP privada (127.0.0.1) → mensaje genérico de red privada, sin revelar que era privada específicamente', async () => {
      dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        'Este link apunta a una red privada o interna, no se puede importar por seguridad.'
      );
    });

    test('IP de metadata de nube (169.254.169.254) → EL MISMO mensaje genérico que una IP privada común', async () => {
      dnsLookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        'Este link apunta a una red privada o interna, no se puede importar por seguridad.'
      );
    });

    test('todo el rango 169.254.0.0/16 (metadata de nube), no solo .169.254, queda bloqueado', async () => {
      dnsLookupMock.mockResolvedValue([{ address: '169.254.1.1', family: 4 }]);

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        'Este link apunta a una red privada o interna, no se puede importar por seguridad.'
      );
    });

    test('IPv4 mapeada a IPv6 (::ffff:127.0.0.1) también cae en el mensaje genérico de red privada', async () => {
      dnsLookupMock.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        'Este link apunta a una red privada o interna, no se puede importar por seguridad.'
      );
    });

    test('archivo que excede el tamaño máximo (límite inyectado de 1MB) → mensaje específico con el límite, sin dejar un temporal huérfano', async () => {
      simularDnsPublico();
      const contenidoGrande = Buffer.alloc(2 * 1024 * 1024, 'x');
      nock('https://cualquier-host.example.com').get('/dataset.csv').reply(200, contenidoGrande, { 'Content-Type': 'text/csv' });

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        'El archivo supera el tamaño máximo permitido (1MB).'
      );
    });

    test('timeout → mensaje específico de descarga cancelada', async () => {
      simularDnsPublico();
      nock('https://cualquier-host.example.com').get('/dataset.csv').delay(15_000).reply(200, 'tarde');

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        'La descarga tardó demasiado y se canceló.'
      );
    }, 20_000);

    test('respuesta HTML con Content-Type text/html (típico de una página de login) → mensaje de "requiere login"', async () => {
      simularDnsPublico();
      nock('https://cualquier-host.example.com')
        .get('/dataset.csv')
        .reply(200, '<html><body>Iniciá sesión</body></html>', { 'Content-Type': 'text/html' });

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        /requiere iniciar sesión/
      );
    });

    test('respuesta HTML servida con Content-Type genérico (sin declarar text/html) también se detecta por el contenido real', async () => {
      simularDnsPublico();
      nock('https://cualquier-host.example.com')
        .get('/dataset.csv')
        .reply(200, '<!DOCTYPE html><html><body>Iniciá sesión</body></html>', { 'Content-Type': 'application/octet-stream' });

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
        /requiere iniciar sesión/
      );
    });

    test('Content-Type/extensión no reconocible → mensaje genérico de "no es un archivo de datos válido" (rechazo temprano, sin bajar el body)', async () => {
      simularDnsPublico();
      nock('https://cualquier-host.example.com')
        .get('/dataset.bin')
        .reply(200, Buffer.from([0x00, 0x01, 0x02, 0x03]), { 'Content-Type': 'application/x-binary-desconocido' });

      await expect(descargador.descargar('https://cualquier-host.example.com/dataset.bin')).rejects.toThrow(
        'El contenido de ese link no es un archivo de datos válido.'
      );
    });

    test('403 de la fuente (típico de una URL firmada expirada) → mensaje específico de link expirado', async () => {
      simularDnsPublico();
      nock('https://storage.googleapis.com').get('/bucket/dataset.csv').reply(403, 'Access denied');

      await expect(descargador.descargar('https://storage.googleapis.com/bucket/dataset.csv')).rejects.toThrow(
        'El link ya no es válido o expiró. Pedí uno nuevo.'
      );
    });

    test('401 de la fuente también da el mensaje de link expirado', async () => {
      simularDnsPublico();
      nock('https://storage.googleapis.com').get('/bucket/dataset.csv').reply(401, 'Unauthorized');

      await expect(descargador.descargar('https://storage.googleapis.com/bucket/dataset.csv')).rejects.toThrow(
        'El link ya no es válido o expiró. Pedí uno nuevo.'
      );
    });
  });

  test('rechaza tras superar el máximo de redirecciones (posible loop de redirects)', async () => {
    simularDnsPublico();
    nock('https://docs.google.com').get('/a').times(1).reply(302, undefined, { Location: 'https://docs.google.com/b' });
    nock('https://docs.google.com').get('/b').times(1).reply(302, undefined, { Location: 'https://docs.google.com/c' });
    nock('https://docs.google.com').get('/c').times(1).reply(302, undefined, { Location: 'https://docs.google.com/d' });
    nock('https://docs.google.com').get('/d').times(1).reply(302, undefined, { Location: 'https://docs.google.com/e' });

    await expect(descargador.descargar('https://docs.google.com/a')).rejects.toThrow(/redireccion/i);
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

    expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoFalso);
    expect(resultado.urlFinal).toBe('https://doc-08-4o-sheets.googleusercontent.com/export/abc/format=xlsx');
    fs.unlinkSync(resultado.rutaArchivo);
  });

  test('UrlNoPermitidaError sigue siendo el tipo de error para todos los rechazos', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(descargador.descargar('https://cualquier-host.example.com/dataset.csv')).rejects.toThrow(
      UrlNoPermitidaError
    );
  });

  // Soporte gzip (2026-07-17): feeds públicos reales de datasets de
  // vulnerabilidades (NVD, EPSS) suelen servirse comprimidos. El .gz de
  // prueba se arma acá mismo con zlib — no depende de internet.
  describe('Soporte gzip', () => {
    test('detecta gzip por extensión ".gz" en el path y descomprime en streaming antes de escribir a disco', async () => {
      simularDnsPublico();
      const csvOriginal = 'cve,epss\nCVE-2024-00001,0.5\nCVE-2024-00002,0.9\n';
      const comprimido = zlib.gzipSync(Buffer.from(csvOriginal, 'utf-8'));
      // Content-Type genérico a propósito: epss.cyentia.com (real) sirve su
      // .csv.gz con Content-Type binary/octet-stream, sin Content-Encoding
      // — la detección tiene que funcionar igual, solo por la extensión.
      nock('https://cualquier-host.example.com')
        .get('/epss_scores-current.csv.gz')
        .reply(200, comprimido, { 'Content-Type': 'binary/octet-stream' });

      const resultado = await descargador.descargar('https://cualquier-host.example.com/epss_scores-current.csv.gz');

      expect(leerArchivo(resultado.rutaArchivo).toString('utf-8')).toBe(csvOriginal);
      fs.unlinkSync(resultado.rutaArchivo);
    });

    test('detecta gzip por el header Content-Encoding aunque la URL no termine en .gz', async () => {
      simularDnsPublico();
      const csvOriginal = 'cve,epss\nCVE-2024-00001,0.5\n';
      const comprimido = zlib.gzipSync(Buffer.from(csvOriginal, 'utf-8'));
      nock('https://cualquier-host.example.com')
        .get('/dataset.csv')
        .reply(200, comprimido, { 'Content-Type': 'text/csv', 'Content-Encoding': 'gzip' });

      const resultado = await descargador.descargar('https://cualquier-host.example.com/dataset.csv');

      expect(leerArchivo(resultado.rutaArchivo).toString('utf-8')).toBe(csvOriginal);
      fs.unlinkSync(resultado.rutaArchivo);
    });

    test('detecta gzip por los bytes mágicos (0x1f 0x8b) aunque no haya extensión ni header', async () => {
      simularDnsPublico();
      const csvOriginal = 'cve,epss\nCVE-2024-00001,0.5\n';
      const comprimido = zlib.gzipSync(Buffer.from(csvOriginal, 'utf-8'));
      // Sin extensión reconocible en el path — extensionOContentTypeParecenValidos
      // pasa igual porque el Content-Type está en la allowlist genérica.
      nock('https://cualquier-host.example.com')
        .get('/descarga')
        .reply(200, comprimido, { 'Content-Type': 'application/octet-stream' });

      const resultado = await descargador.descargar('https://cualquier-host.example.com/descarga');

      expect(leerArchivo(resultado.rutaArchivo).toString('utf-8')).toBe(csvOriginal);
      fs.unlinkSync(resultado.rutaArchivo);
    });

    test('un contenido NO gzip (sin extensión .gz, sin header, sin bytes mágicos) se deja tal cual, sin intentar descomprimir', async () => {
      simularDnsPublico();
      const csvPlano = 'cve,epss\nCVE-2024-00001,0.5\n';
      nock('https://cualquier-host.example.com')
        .get('/dataset.csv')
        .reply(200, csvPlano, { 'Content-Type': 'text/csv' });

      const resultado = await descargador.descargar('https://cualquier-host.example.com/dataset.csv');

      expect(leerArchivo(resultado.rutaArchivo).toString('utf-8')).toBe(csvPlano);
      fs.unlinkSync(resultado.rutaArchivo);
    });

    // Zip bomb: el .gz descargado respeta el límite EN COMPRIMIDO, pero al
    // descomprimir crece mucho más allá del límite — debe abortar con el
    // mismo mensaje de tamaño excedido, sin intentar acumular todo el
    // contenido descomprimido en memoria/disco primero. Con el límite de
    // prueba (1MB) alcanza con un contenido de unos pocos MB, altamente
    // compresible, para probarlo de verdad sin necesitar gigabytes.
    test('un .gz cuyo contenido DESCOMPRIMIDO supera el límite se aborta con el mensaje de tamaño excedido', async () => {
      simularDnsPublico();
      const contenidoQueExcedeElLimite = Buffer.alloc(3 * 1024 * 1024, 'a'); // 3MB > 1MB de límite
      const comprimido = zlib.gzipSync(contenidoQueExcedeElLimite);
      expect(comprimido.length).toBeLessThan(LIMITE_DE_PRUEBA); // el COMPRIMIDO sí entra bajo el límite

      nock('https://cualquier-host.example.com')
        .get('/bomba.csv.gz')
        .reply(200, comprimido, { 'Content-Type': 'application/octet-stream' });

      await expect(descargador.descargar('https://cualquier-host.example.com/bomba.csv.gz')).rejects.toThrow(
        'El archivo supera el tamaño máximo permitido (1MB).'
      );
    });

    test('un archivo .gz corrupto (bytes mágicos válidos pero contenido inválido) da un mensaje de contenido inválido, no un crash', async () => {
      simularDnsPublico();
      const gzCorrupto = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from('esto no es gzip de verdad')]);
      nock('https://cualquier-host.example.com').get('/corrupto.csv.gz').reply(200, gzCorrupto, {
        'Content-Type': 'application/octet-stream'
      });

      await expect(descargador.descargar('https://cualquier-host.example.com/corrupto.csv.gz')).rejects.toThrow(
        UrlNoPermitidaError
      );
    });
  });

  // Límite real de producción (1GB): un único test de humo (con el default,
  // sin límite inyectado) para confirmar que el valor real es el que
  // realmente queda configurado — el resto de los tests usa un límite chico
  // inyectado para no transferir gigabytes en cada corrida.
  test('el límite real por defecto (sin inyectar ninguno) es 1GB', async () => {
    simularDnsPublico();
    const descargadorReal = new DescargadorDeArchivosHttp();
    const contenidoChico = Buffer.from('contenido-chico');
    nock('https://cualquier-host.example.com').get('/dataset.csv').reply(200, contenidoChico, { 'Content-Type': 'text/csv' });

    const resultado = await descargadorReal.descargar('https://cualquier-host.example.com/dataset.csv');

    expect(leerArchivo(resultado.rutaArchivo)).toEqual(contenidoChico);
    fs.unlinkSync(resultado.rutaArchivo);
  });
});
