export type TipoDeLink = 'nvd' | 'googleSheets' | 'dropbox' | 'directo' | 'noPermitido';

export interface ResultadoDeteccionLink {
  tipo: TipoDeLink;
  // Presente en todos los casos excepto 'noPermitido' — para 'nvd' no aplica
  // descarga de archivo (dispara SincronizarConApiNvd), así que queda
  // undefined también ahí.
  urlDescargable?: string;
  motivoRechazo?: string;
}

// Cambio de diseño (2026-07-17): se eliminó la allowlist de hosts
// específicos como FILTRO DE ENTRADA — "importar desde link"/"convertir a
// Excel" ahora aceptan cualquier hostname público (ej. URLs firmadas de
// Google Cloud Storage, S3, etc., que nunca podrían anticiparse en una
// lista fija). La protección real contra SSRF sigue siendo
// DescargadorDeArchivosHttp: resolución de DNS + bloqueo de rangos
// privados/loopback/link-local (incluida IPv4 mapeada a IPv6) en CADA
// salto de redirección, límite de redirecciones, tamaño y timeout, y
// validación de que el contenido final sea realmente un archivo de datos.
// Estos tres hosts YA NO son una allowlist de aceptación — son solo las
// excepciones que reciben una transformación de URL especial conocida
// (NVD dispara la sincronización JSON; Sheets reescribe a su URL de
// export; Dropbox fuerza dl=1). Cualquier otro host cae en 'directo'.
const HOSTS_NVD = new Set(['nvd.nist.gov', 'api.nvd.nist.gov', 'services.nvd.nist.gov']);
const HOST_GOOGLE_SHEETS = 'docs.google.com';
const HOSTS_DROPBOX = new Set(['www.dropbox.com', 'dropbox.com']);

// Google Sheets: /spreadsheets/d/<ID>/... (el link de "compartir" normal) se
// reescribe a la forma exportable. Un ID de Google Drive es
// alfanumérico + "-"/"_", sin longitud fija garantizada por Google, así que
// no se valida longitud, solo el charset.
const PATRON_GOOGLE_SHEETS_ID = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

function rechazar(motivo: string): ResultadoDeteccionLink {
  return { tipo: 'noPermitido', motivoRechazo: motivo };
}

// Clasifica una URL pegada por el usuario y, para los tipos descargables,
// devuelve la URL ya transformada a su forma real de descarga — el llamador
// (ImportarDatasetDesdeUrl) nunca tiene que saber de Google Sheets/Dropbox.
export function detectarTipoDeLink(urlCruda: string): ResultadoDeteccionLink {
  let url: URL;
  try {
    url = new URL(urlCruda.trim());
  } catch {
    return rechazar('URL malformada');
  }

  // Ni siquiera se evalúa el host si el esquema no es https: cierra de
  // entrada cualquier variante de downgrade de protocolo.
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
    return { tipo: 'nvd', urlDescargable: url.toString() };
  }

  // CRÍTICO: esta transformación (reescribir a .../export?format=xlsx) es
  // EXCLUSIVA de docs.google.com — nunca se aplica a otro dominio de Google
  // (ej. storage.googleapis.com, que es Google Cloud Storage, no Sheets, y
  // cuyas URLs firmadas no tienen nada que ver con este patrón). Si el host
  // es docs.google.com pero el path no matchea el patrón de "compartir" de
  // Sheets, cae al caso genérico 'directo' de más abajo, tal cual llegó.
  if (host === HOST_GOOGLE_SHEETS) {
    const coincidencia = url.pathname.match(PATRON_GOOGLE_SHEETS_ID);
    if (coincidencia) {
      return {
        tipo: 'googleSheets',
        urlDescargable: `https://docs.google.com/spreadsheets/d/${coincidencia[1]}/export?format=xlsx`
      };
    }
  }

  if (HOSTS_DROPBOX.has(host)) {
    const urlTransformada = new URL(url.toString());
    urlTransformada.searchParams.set('dl', '1');
    return { tipo: 'dropbox', urlDescargable: urlTransformada.toString() };
  }

  // Caso genérico: CUALQUIER otro host https (incluye docs.google.com con
  // un path que no es de Sheets). No se toca ni se reconstruye la query
  // string acá (a diferencia de Dropbox arriba, que SÍ la modifica a
  // propósito) — crítico para URLs firmadas (Google Cloud Storage, S3, etc.)
  // que llevan su autenticación en parámetros como X-Goog-Signature: alterar
  // un solo carácter invalida la firma y la descarga falla, no por
  // seguridad sino porque la URL ya dejó de ser la original.
  return { tipo: 'directo', urlDescargable: url.toString() };
}
