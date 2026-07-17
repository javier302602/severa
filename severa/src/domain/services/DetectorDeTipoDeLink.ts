export type TipoDeLink = 'nvd' | 'googleSheets' | 'dropbox' | 'directo' | 'noPermitido';

export interface ResultadoDeteccionLink {
  tipo: TipoDeLink;
  // Presente en todos los casos excepto 'noPermitido' — para 'nvd' no aplica
  // descarga de archivo (dispara SincronizarConApiNvd), así que queda
  // undefined también ahí.
  urlDescargable?: string;
  motivoRechazo?: string;
}

// Allowlist deny-by-default (Sprint 17): SOLO estos hosts, comparados por
// IGUALDAD EXACTA de hostname — nunca startsWith/includes/endsWith, que son
// la forma clásica de bypass de allowlist (ej. "nvd.nist.gov.evil.com" o
// "evil-nvd.nist.gov" pasarían un check por substring). Esta es la PRIMERA
// línea de defensa; DescargadorDeArchivosHttp.ts es la segunda (resuelve el
// host a IP y rechaza rangos privados/loopback/link-local antes de
// conectar, por si alguno de estos hosts confiables alguna vez resolviera
// a algo inesperado — defensa en profundidad, no redundancia inútil).
//
// api.nvd.nist.gov confirmado contra NVD_API_BASE_URL real (env.ts);
// "services.nvd.nist.gov" NO se incluye por no estar en uso en ningún lado
// del código — no se hardcodea un host sin evidencia de que se use.
const HOSTS_NVD = new Set(['nvd.nist.gov', 'api.nvd.nist.gov']);
const HOSTS_GOOGLE = new Set(['docs.google.com']);
const HOSTS_DROPBOX = new Set(['www.dropbox.com', 'dropbox.com']);

// Google Sheets: /spreadsheets/d/<ID>/... (el link de "compartir" normal) se
// reescribe a la forma exportable. Un ID de Google Drive es
// alfanumérico + "-"/"_", sin longitud fija garantizada por Google, así que
// no se valida longitud, solo el charset.
const PATRON_GOOGLE_SHEETS_ID = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

function rechazar(motivo: string): ResultadoDeteccionLink {
  return { tipo: 'noPermitido', motivoRechazo: motivo };
}

// Reutilizado por DescargadorDeArchivosHttp.ts para revalidar el host de
// CADA redirección contra la MISMA allowlist (una sola fuente de verdad —
// nunca dos listas de hosts permitidos que puedan divergir con el tiempo).
export function esHostPermitido(hostname: string): boolean {
  return HOSTS_NVD.has(hostname) || HOSTS_GOOGLE.has(hostname) || HOSTS_DROPBOX.has(hostname);
}

const SUFIJO_GOOGLEUSERCONTENT = '.googleusercontent.com';

// Caso especial acotado (Sprint 17): el endpoint real de exportación de
// Google Sheets (docs.google.com/spreadsheets/.../export?format=xlsx)
// SIEMPRE redirige (307) a un subdominio dinámico de googleusercontent.com
// para servir el archivo — confirmado con "curl -I" contra un spreadsheet
// público real:
//   HTTP/1.1 307 Temporary Redirect
//   Location: https://doc-08-4o-sheets.googleusercontent.com/export/.../format=xlsx
// El prefijo ("doc-08-4o-sheets") cambia por documento/sesión, así que no
// existe un host fijo que se pueda agregar como entrada exacta a la
// allowlist — sin este caso especial, "importar desde Google Sheets" nunca
// podría completarse contra la infraestructura real de Google.
//
// Se acepta *solo* como destino de una redirección, y *solo* cuando el
// salto INMEDIATO ANTERIOR ya validado en la misma cadena fue exactamente
// docs.google.com — nunca como link inicial (DetectorDeTipoDeLink jamás
// clasifica un link como 'googleSheets' si el host no es docs.google.com)
// y nunca si el salto anterior fue cualquier otro host (incluido otro
// googleusercontent.com encadenado). Sigue sujeto, igual que cualquier
// otro host de la allowlist, a la resolución DNS + validación de IP
// pública (resolverIpSegura) y a la validación de tipo de archivo
// (validarTipoDeArchivo) antes de aceptar el contenido — esto NO reabre
// SSRF contra red interna, solo extiende la confianza que ya le dimos a
// docs.google.com a la infraestructura de contenido de la misma empresa.
export function esHostPermitidoComoRedireccion(hostname: string, hostAnterior: string | null): boolean {
  if (esHostPermitido(hostname)) {
    return true;
  }
  const esRedireccionDeExportDeGoogleSheets = hostname.endsWith(SUFIJO_GOOGLEUSERCONTENT) && hostAnterior === 'docs.google.com';
  return esRedireccionDeExportDeGoogleSheets;
}

// Clasifica una URL pegada por el usuario y, para los tipos descargables,
// devuelve la URL ya transformada a su forma real de descarga — el llamador
// (ImportarDatasetDesdeUrl) nunca tiene que saber de Google Sheets/Dropbox.
export function detectarTipoDeLink(urlCruda: string): ResultadoDeteccionLink {
  let url: URL;
  try {
    url = new URL(urlCruda);
  } catch {
    return rechazar('URL malformada');
  }

  // Ni siquiera se evalúa el host si el esquema no es https: cierra de
  // entrada cualquier variante de downgrade de protocolo, y los tres
  // servicios permitidos solo sirven contenido real por HTTPS de todas
  // formas.
  if (url.protocol !== 'https:') {
    return rechazar(`Esquema no permitido: ${url.protocol.replace(':', '')} (solo https)`);
  }

  // url.hostname ya viene normalizado a minúsculas por el propio parser de
  // URL (WHATWG), y NUNCA incluye userinfo (el "usuario@" de
  // "https://nvd.nist.gov@evil.com/" cae en url.username, no en
  // url.hostname) — ambos son vectores clásicos de bypass de allowlist que
  // esta comparación ya esquiva por construcción, no por chequeo manual.
  const host = url.hostname;

  if (HOSTS_NVD.has(host)) {
    return { tipo: 'nvd' };
  }

  if (HOSTS_GOOGLE.has(host)) {
    const coincidencia = url.pathname.match(PATRON_GOOGLE_SHEETS_ID);
    if (coincidencia) {
      return {
        tipo: 'googleSheets',
        urlDescargable: `https://docs.google.com/spreadsheets/d/${coincidencia[1]}/export?format=xlsx`
      };
    }
    // Host confiable pero no es el patrón de "compartir" de Sheets que
    // sabemos reescribir (ej. ya es un link de export, o es otro producto
    // de Google Docs) — se usa tal cual en vez de adivinar una transformación.
    return { tipo: 'directo', urlDescargable: url.toString() };
  }

  if (HOSTS_DROPBOX.has(host)) {
    const urlTransformada = new URL(url.toString());
    urlTransformada.searchParams.set('dl', '1');
    return { tipo: 'dropbox', urlDescargable: urlTransformada.toString() };
  }

  return rechazar(`Dominio no permitido: ${host}`);
}
