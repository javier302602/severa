import https from 'https';
import type { IncomingMessage } from 'http';
import zlib from 'zlib';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import { promises as dns } from 'dns';
import type { LookupFunction } from 'net';
import ipaddr from 'ipaddr.js';
import { DescargadorDeArchivos, ArchivoDescargado } from '../../../../application/ports/out/DescargadorDeArchivos';
import { UrlNoPermitidaError } from '../../../../domain/errors/UrlNoPermitidaError';

// Límite subido de 5MB a 1GB (2026-07-17) para soportar datasets públicos
// reales de tamaño completo (NVD/EPSS/CISA enriquecidos, cientos de MB). A
// esta escala YA NO alcanza con juntar todo en memoria — todo este archivo
// pasó a trabajar en streaming: la respuesta de red se escribe directo a un
// archivo temporal a medida que llega (con gunzip en el mismo pipeline si
// corresponde), nunca se arma un Buffer con el contenido completo.
//
// Inyectable por constructor (default 1GB en producción) para que los tests
// puedan verificar el mecanismo de corte con buffers chicos, sin necesitar
// transferir gigabytes reales en cada corrida de la suite.
const TAMANO_MAXIMO_BYTES_DEFAULT = 1024 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
// Máximo de saltos de redirección A SEGUIR (no cuenta la petición inicial).
const MAX_REDIRECCIONES = 3;

const EXTENSIONES_PERMITIDAS = ['.xlsx', '.xls', '.csv'];
// application/octet-stream porque Dropbox y el export de Google Sheets
// suelen servir el archivo con un Content-Type genérico en vez del MIME
// type exacto de Excel/CSV.
const CONTENT_TYPES_PERMITIDOS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'application/octet-stream'
];

const MSG_RED_PRIVADA = 'Este link apunta a una red privada o interna, no se puede importar por seguridad.';
const MSG_HOST_NO_RESUELVE = 'No se pudo encontrar ese dominio. Verificá que el link esté bien escrito.';
const MSG_REQUIERE_LOGIN =
  'Este link requiere iniciar sesión o no es un archivo descargable directo. Descargá el archivo manualmente y subilo con "Subir archivo" en su lugar.';
function formatearMensajeTamanoExcedido(limiteBytes: number): string {
  const enGB = limiteBytes / (1024 * 1024 * 1024);
  const tamano = enGB >= 1 ? `${enGB}GB` : `${limiteBytes / (1024 * 1024)}MB`;
  return `El archivo supera el tamaño máximo permitido (${tamano}).`;
}
const MSG_TIMEOUT = 'La descarga tardó demasiado y se canceló.';
const MSG_CONTENT_TYPE_INVALIDO = 'El contenido de ese link no es un archivo de datos válido.';
const MSG_LINK_EXPIRADO = 'El link ya no es válido o expiró. Pedí uno nuevo.';

type ResultadoSolicitud = { tipo: 'redireccion'; ubicacion: string } | { tipo: 'contenido'; contentType: string | null };

// Único punto de "¿esta IP es segura para conectar?" — default-deny: SOLO se
// acepta el rango 'unicast' (dirección pública normal). 169.254.0.0/16
// completo (incluida 169.254.169.254, metadata de nube) cae en 'linkLocal',
// nunca 'unicast' — confirmado con ipaddr.js.
function esIpPublica(direccionIp: string): boolean {
  return ipaddr.process(direccionIp).range() === 'unicast';
}

async function resolverIpSegura(hostname: string): Promise<string> {
  let direcciones: Array<{ address: string }>;
  try {
    direcciones = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlNoPermitidaError(MSG_HOST_NO_RESUELVE);
  }

  if (direcciones.length === 0) {
    throw new UrlNoPermitidaError(MSG_HOST_NO_RESUELVE);
  }

  for (const { address } of direcciones) {
    if (!esIpPublica(address)) {
      throw new UrlNoPermitidaError(MSG_RED_PRIVADA);
    }
  }

  return direcciones[0].address;
}

function pareceHtml(contentType: string | null, inicio: Buffer): boolean {
  const tipoBase = contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
  if (tipoBase === 'text/html') {
    return true;
  }
  const texto = inicio.subarray(0, 512).toString('utf-8').trimStart().toLowerCase();
  return texto.startsWith('<!doctype html') || texto.startsWith('<html');
}

// Chequeo SIN cuerpo (solo extensión/Content-Type) — corre antes de tocar un
// solo byte del body, así que un link obviamente inválido (PDF, imagen, lo
// que sea) se rechaza sin gastar ancho de banda. NO reemplaza el sniffing de
// HTML (ver crearTransformDeteccionHtml): ese sigue corriendo SIEMPRE sobre
// el cuerpo real, porque este chequeo por extensión es deliberadamente
// permisivo (".csv" pasa aunque el contenido real sea una página de login).
function extensionOContentTypeParecenValidos(urlFinal: string, contentType: string | null): boolean {
  let pathname = new URL(urlFinal).pathname.toLowerCase();
  if (pathname.endsWith('.gz')) {
    pathname = pathname.slice(0, -3);
  }
  const tieneExtensionPermitida = EXTENSIONES_PERMITIDAS.some((extension) => pathname.endsWith(extension));
  const tipoBase = contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
  const tieneContentTypePermitido = tipoBase !== null && CONTENT_TYPES_PERMITIDOS.includes(tipoBase);
  return tieneExtensionPermitida || tieneContentTypePermitido;
}

// Transform que cuenta bytes a medida que pasan y corta el stream apenas se
// supera el límite — nunca junta el contenido completo en memoria antes de
// medirlo (eso es justo lo que permite una "zip bomb" con gzip: pocos MB
// comprimidos expandiéndose a mucho más). Se reutiliza tanto para el tamaño
// crudo recibido de la red como, si hay gzip, para el tamaño YA
// descomprimido — dos chequeos independientes, mismo límite.
function crearTransformDeLimite(limiteBytes: number): Transform {
  let total = 0;
  const mensaje = formatearMensajeTamanoExcedido(limiteBytes);
  return new Transform({
    transform(chunk: Buffer, _enc, callback) {
      total += chunk.length;
      if (total > limiteBytes) {
        callback(new UrlNoPermitidaError(mensaje));
        return;
      }
      callback(null, chunk);
    }
  });
}

// Sniffing de HTML como Transform: examina el PRIMER chunk que pasa (en la
// práctica, muchos KB de una sola vez — TLS entrega de a "records", no byte
// a byte) y aborta ahí si parece una página de login en vez del archivo
// esperado. Evita tener que "espiar y rearmar" el stream para este chequeo.
function crearTransformDeteccionHtml(contentType: string | null): Transform {
  let decidido = false;
  return new Transform({
    transform(chunk: Buffer, _enc, callback) {
      if (!decidido) {
        decidido = true;
        if (pareceHtml(contentType, chunk)) {
          callback(new UrlNoPermitidaError(MSG_REQUIERE_LOGIN));
          return;
        }
      }
      callback(null, chunk);
    }
  });
}

// Decide si el cuerpo viene gzip-comprimido. Content-Encoding y la extensión
// ".gz" son señales gratuitas (no hace falta mirar ni un byte del body) y
// cubren los casos reales confirmados (NVD/EPSS) — services.nvd.nist.gov no
// gzipea, epss.cyentia.com sirve un .gz estático sin Content-Encoding, así
// que ninguna señal sola alcanza sola para los DOS casos reales. Cuando
// ninguna de las dos aplica, se espían los primeros bytes en busca de los
// mágicos de gzip (0x1f 0x8b) — el ÚNICO caso que necesita mirar contenido
// ANTES de decidir la forma del pipeline (con o sin gunzip), por eso es el
// único que arma un stream "reconstituido" (bytes ya leídos + el resto).
async function detectarGzipYObtenerCuerpo(
  res: IncomingMessage,
  url: URL,
  contentEncoding: string | null
): Promise<{ esGzip: boolean; cuerpo: Readable }> {
  if (contentEncoding?.toLowerCase().includes('gzip') || url.pathname.toLowerCase().endsWith('.gz')) {
    return { esGzip: true, cuerpo: res };
  }

  const primerChunk: Buffer = await new Promise((resolve, reject) => {
    res.once('data', (chunk: Buffer) => {
      res.pause();
      resolve(chunk);
    });
    res.once('end', () => resolve(Buffer.alloc(0)));
    res.once('error', reject);
  });

  const esGzip = primerChunk.length >= 2 && primerChunk[0] === 0x1f && primerChunk[1] === 0x8b;

  async function* reconstituido(): AsyncGenerator<Buffer> {
    if (primerChunk.length > 0) {
      yield primerChunk;
    }
    for await (const chunk of res) {
      yield chunk as Buffer;
    }
  }

  return { esGzip, cuerpo: Readable.from(reconstituido()) };
}

// Implementa DescargadorDeArchivos con http/https nativos de Node (no axios
// — necesitamos revalidar la IP de CADA redirección antes de seguirla, y
// axios/follow-redirects conecta automáticamente sin darnos ese control).
//
// Ya NO hay una allowlist de hosts que revalidar en cada salto (ver
// DetectorDeTipoDeLink.ts): cualquier host https es un destino de
// redirección válido, SIEMPRE sujeto a resolverIpSegura — esa es la
// protección real contra SSRF, no una lista de dominios conocidos.
export class DescargadorDeArchivosHttp implements DescargadorDeArchivos {
  constructor(private readonly limiteBytes: number = TAMANO_MAXIMO_BYTES_DEFAULT) {}

  async descargar(urlInicial: string): Promise<ArchivoDescargado> {
    const rutaDestino = path.join(os.tmpdir(), `severa-descarga-${randomUUID()}`);
    let urlActual = urlInicial;

    try {
      for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
        const url = new URL(urlActual);

        if (url.protocol !== 'https:') {
          throw new UrlNoPermitidaError(`Esquema no permitido: ${url.protocol}`);
        }

        const ipSegura = await resolverIpSegura(url.hostname);
        const resultado = await this.solicitarUnaVez(url, ipSegura, rutaDestino);

        if (resultado.tipo === 'redireccion') {
          if (salto === MAX_REDIRECCIONES) {
            throw new UrlNoPermitidaError('Demasiadas redirecciones');
          }
          urlActual = new URL(resultado.ubicacion, url).toString();
          continue;
        }

        return { rutaArchivo: rutaDestino, contentType: resultado.contentType, urlFinal: url.toString() };
      }

      throw new UrlNoPermitidaError('Demasiadas redirecciones');
    } catch (error) {
      // Por si se alcanzó a escribir algo en rutaDestino antes del error
      // (ej. el límite de tamaño cortó a mitad de la descarga) — nunca dejar
      // un archivo temporal huérfano en disco.
      await fs.promises.unlink(rutaDestino).catch(() => {});
      throw error;
    }
  }

  private solicitarUnaVez(url: URL, ipSegura: string, rutaDestino: string): Promise<ResultadoSolicitud> {
    return new Promise((resolve, reject) => {
      const family = ipaddr.process(ipSegura).kind() === 'ipv6' ? 6 : 4;
      const lookupForzado: LookupFunction = (_hostname, options, callback) => {
        if (typeof options === 'object' && options !== null && options.all) {
          callback(null, [{ address: ipSegura, family }]);
          return;
        }
        callback(null, ipSegura, family);
      };

      const opciones: https.RequestOptions = {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: { Host: url.hostname, 'User-Agent': 'SEVERA/1.0' },
        timeout: TIMEOUT_MS,
        lookup: lookupForzado
      };

      const req = https.request(opciones, (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolve({ tipo: 'redireccion', ubicacion: res.headers.location });
          return;
        }

        // 401/403: típico de una URL firmada (Google Cloud Storage, S3,
        // etc.) cuyo token de acceso ya expiró o nunca fue válido.
        if (status === 401 || status === 403) {
          res.resume();
          reject(new UrlNoPermitidaError(MSG_LINK_EXPIRADO));
          return;
        }

        if (status !== 200) {
          res.resume();
          reject(new UrlNoPermitidaError(`El servidor remoto respondió con estado ${status}`));
          return;
        }

        const contentType = (res.headers['content-type'] as string | undefined) ?? null;

        if (!extensionOContentTypeParecenValidos(url.toString(), contentType)) {
          res.resume();
          reject(new UrlNoPermitidaError(MSG_CONTENT_TYPE_INVALIDO));
          return;
        }

        const contentEncoding = (res.headers['content-encoding'] as string | undefined) ?? null;

        detectarGzipYObtenerCuerpo(res, url, contentEncoding)
          .then(({ esGzip, cuerpo }) => {
            const etapas: Array<NodeJS.ReadableStream | NodeJS.WritableStream> = esGzip
              ? [cuerpo, crearTransformDeLimite(this.limiteBytes), zlib.createGunzip(), crearTransformDeLimite(this.limiteBytes), crearTransformDeteccionHtml(contentType)]
              : [cuerpo, crearTransformDeLimite(this.limiteBytes), crearTransformDeteccionHtml(contentType)];

            return pipeline([...etapas, fs.createWriteStream(rutaDestino)]);
          })
          .then(() => resolve({ tipo: 'contenido', contentType }))
          .catch((error) => {
            // Los Transforms propios (límite de tamaño, sniffing de HTML) ya
            // rechazan con UrlNoPermitidaError — se propagan tal cual. Un
            // .gz corrupto hace que zlib tire su propio Error de bajo nivel
            // ("unknown compression method", etc.), que se traduce acá al
            // mismo mensaje que un Content-Type inválido (no es un archivo
            // de datos utilizable), en vez de dejar escapar el error técnico.
            reject(error instanceof UrlNoPermitidaError ? error : new UrlNoPermitidaError(MSG_CONTENT_TYPE_INVALIDO));
          });
      });

      req.on('timeout', () => {
        req.destroy(new UrlNoPermitidaError(MSG_TIMEOUT));
      });
      req.on('error', reject);
      req.end();
    });
  }
}
