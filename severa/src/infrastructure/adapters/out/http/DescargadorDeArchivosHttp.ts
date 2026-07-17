import https from 'https';
import { promises as dns } from 'dns';
import type { LookupFunction } from 'net';
import ipaddr from 'ipaddr.js';
import { DescargadorDeArchivos, ArchivoDescargado } from '../../../../application/ports/out/DescargadorDeArchivos';
import { esHostPermitidoComoRedireccion } from '../../../../domain/services/DetectorDeTipoDeLink';
import { UrlNoPermitidaError } from '../../../../domain/errors/UrlNoPermitidaError';

// Mismo criterio de tamaño que multer en DatasetController.ts (Sprint 14).
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
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

type ResultadoSolicitud =
  | { tipo: 'redireccion'; ubicacion: string }
  | { tipo: 'contenido'; contenido: Buffer; contentType: string | null };

// Único punto de "¿esta IP es segura para conectar?" — default-deny: SOLO se
// acepta el rango 'unicast' (dirección pública normal). ipaddr.process()
// además unifica direcciones IPv4 mapeadas a IPv6 (::ffff:127.0.0.1) a su
// forma IPv4 real antes de clasificar, así que ese vector de bypass
// específico queda cubierto por la librería, no por una regex propia.
function esIpPublica(direccionIp: string): boolean {
  return ipaddr.process(direccionIp).range() === 'unicast';
}

// Resuelve el hostname UNA vez y valida TODAS las direcciones que devuelva
// (un host puede resolver a varias IPs) antes de conectar. Devuelve la
// primera dirección ya validada para que el request se conecte a ESA IP
// exacta (ver `lookup` en solicitarUnaVez) — nunca se deja que el socket
// vuelva a resolver el hostname por su cuenta en el momento de conectar, que
// es exactamente la ventana que habilita un ataque de DNS rebinding (DNS
// responde una IP pública para esta validación, pero una IP interna para la
// conexión real, si ambas resoluciones ocurrieran por separado).
async function resolverIpSegura(hostname: string): Promise<string> {
  let direcciones: Array<{ address: string }>;
  try {
    direcciones = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlNoPermitidaError(`No se pudo resolver el host: ${hostname}`);
  }

  if (direcciones.length === 0) {
    throw new UrlNoPermitidaError(`El host no resolvió a ninguna dirección: ${hostname}`);
  }

  for (const { address } of direcciones) {
    if (!esIpPublica(address)) {
      throw new UrlNoPermitidaError(`El host "${hostname}" resuelve a una dirección IP no permitida`);
    }
  }

  return direcciones[0].address;
}

function validarTipoDeArchivo(urlFinal: string, contentType: string | null): void {
  const path = new URL(urlFinal).pathname.toLowerCase();
  const tieneExtensionPermitida = EXTENSIONES_PERMITIDAS.some((extension) => path.endsWith(extension));
  const tipoBase = contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
  const tieneContentTypePermitido = tipoBase !== null && CONTENT_TYPES_PERMITIDOS.includes(tipoBase);

  if (!tieneExtensionPermitida && !tieneContentTypePermitido) {
    throw new UrlNoPermitidaError(
      `El contenido descargado no parece ser un archivo de hoja de cálculo (Content-Type: ${contentType ?? 'desconocido'})`
    );
  }
}

// Implementa DescargadorDeArchivos con http/https nativos de Node (no axios
// — necesitamos revalidar host+IP de CADA redirección antes de seguirla, y
// axios/follow-redirects conecta automáticamente sin darnos ese control).
export class DescargadorDeArchivosHttp implements DescargadorDeArchivos {
  async descargar(urlInicial: string): Promise<ArchivoDescargado> {
    let urlActual = urlInicial;
    // Solo se usa para el caso especial acotado de docs.google.com ->
    // *.googleusercontent.com (ver esHostPermitidoComoRedireccion): null en
    // el primer salto, así que ese caso especial nunca aplica como link
    // inicial, solo como destino de una redirección real.
    let hostAnterior: string | null = null;

    for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
      const url = new URL(urlActual);

      if (url.protocol !== 'https:') {
        throw new UrlNoPermitidaError(`Esquema no permitido: ${url.protocol}`);
      }
      // Revalida ESTE salto (incluido el primero) contra la misma allowlist
      // que ya aplicó DetectorDeTipoDeLink — un host confiable podría, en
      // teoría, redirigir a uno que no lo es.
      if (!esHostPermitidoComoRedireccion(url.hostname, hostAnterior)) {
        throw new UrlNoPermitidaError(`Dominio no permitido: ${url.hostname}`);
      }

      const ipSegura = await resolverIpSegura(url.hostname);
      const resultado = await this.solicitarUnaVez(url, ipSegura);

      if (resultado.tipo === 'redireccion') {
        if (salto === MAX_REDIRECCIONES) {
          throw new UrlNoPermitidaError('Demasiadas redirecciones');
        }
        hostAnterior = url.hostname;
        urlActual = new URL(resultado.ubicacion, url).toString();
        continue;
      }

      validarTipoDeArchivo(url.toString(), resultado.contentType);
      return { contenido: resultado.contenido, contentType: resultado.contentType, urlFinal: url.toString() };
    }

    throw new UrlNoPermitidaError('Demasiadas redirecciones');
  }

  private solicitarUnaVez(url: URL, ipSegura: string): Promise<ResultadoSolicitud> {
    return new Promise((resolve, reject) => {
      // Fuerza la conexión TCP a la IP ya validada, ignorando lo que el
      // propio socket pudiera resolver de nuevo — cierra la ventana de DNS
      // rebinding. El Host/SNI real (url.hostname) se manda igual, así que
      // la validación del certificado TLS sigue intacta.
      //
      // Node 20+ hace "Happy Eyeballs" (RFC 8305, net.js) y puede invocar
      // esta función pidiendo TODAS las direcciones (options.all=true),
      // esperando callback(err, LookupAddress[]) en vez de
      // callback(err, address, family) — bug real encontrado probando en
      // vivo contra docs.google.com (nock nunca ejercita esta función: hookea
      // el transporte HTTP entero, así que este código nunca corría en los
      // tests). Hay que soportar ambas formas de la firma.
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

        if (status !== 200) {
          res.resume();
          reject(new UrlNoPermitidaError(`El servidor remoto respondió con estado ${status}`));
          return;
        }

        const trozos: Buffer[] = [];
        let bytesRecibidos = 0;

        res.on('data', (trozo: Buffer) => {
          bytesRecibidos += trozo.length;
          if (bytesRecibidos > TAMANO_MAXIMO_BYTES) {
            req.destroy();
            reject(
              new UrlNoPermitidaError(
                `El archivo excede el tamaño máximo permitido (${TAMANO_MAXIMO_BYTES / (1024 * 1024)} MB)`
              )
            );
            return;
          }
          trozos.push(trozo);
        });

        res.on('end', () => {
          resolve({
            tipo: 'contenido',
            contenido: Buffer.concat(trozos),
            contentType: res.headers['content-type'] ?? null
          });
        });

        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy(new UrlNoPermitidaError('Tiempo de espera agotado al descargar el archivo'));
      });
      req.on('error', reject);
      req.end();
    });
  }
}
