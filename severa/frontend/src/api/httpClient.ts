const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type ProveedorDeToken = () => string | null;
type ManejadorNoAutorizado = () => void;

let obtenerToken: ProveedorDeToken = () => null;
let alRecibirNoAutorizado: ManejadorNoAutorizado = () => {};

// AuthContext se registra acá una sola vez (ver AuthContext.tsx) para que este
// módulo, que no es un componente de React, pueda leer el token vigente y
// disparar logout ante un 401 — el equivalente a los interceptores de axios,
// pero sobre fetch nativo.
export function configurarHttpClient(opciones: {
  obtenerToken: ProveedorDeToken;
  alRecibirNoAutorizado: ManejadorNoAutorizado;
}): void {
  obtenerToken = opciones.obtenerToken;
  alRecibirNoAutorizado = opciones.alRecibirNoAutorizado;
}

export class HttpError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface OpcionesPeticion {
  method?: Metodo;
  body?: unknown;
  esFormData?: boolean;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

function construirUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [clave, valor] of Object.entries(query)) {
      if (valor !== undefined) {
        url.searchParams.set(clave, String(valor));
      }
    }
  }
  return url.toString();
}

async function leerCuerpoDeError(response: Response): Promise<{ mensaje: string; body?: unknown }> {
  try {
    const cuerpo = (await response.json()) as { error?: string };
    return { mensaje: cuerpo.error ?? `Error ${response.status}`, body: cuerpo };
  } catch {
    return { mensaje: `Error ${response.status}` };
  }
}

async function leerCuerpoDeRespuesta<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  if (contentType.includes('text/csv') || contentType.includes('image/svg')) {
    return (await response.text()) as unknown as T;
  }
  return (await response.blob()) as unknown as T;
}

async function peticion<T>(path: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { method = 'GET', body, esFormData, query, signal } = opciones;
  const headers: Record<string, string> = {};

  const token = obtenerToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined && !esFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(construirUrl(path, query), {
    method,
    headers,
    body: esFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    signal
  });

  if (response.status === 401) {
    alRecibirNoAutorizado();
    throw new HttpError(401, 'Sesión expirada o inválida');
  }

  if (!response.ok) {
    const { mensaje, body: cuerpoError } = await leerCuerpoDeError(response);
    throw new HttpError(response.status, mensaje, cuerpoError);
  }

  return leerCuerpoDeRespuesta<T>(response);
}

export const httpClient = {
  get: <T,>(path: string, query?: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    peticion<T>(path, { method: 'GET', query, signal }),
  post: <T,>(path: string, body?: unknown) => peticion<T>(path, { method: 'POST', body }),
  postForm: <T,>(path: string, formData: FormData) => peticion<T>(path, { method: 'POST', body: formData, esFormData: true }),
  put: <T,>(path: string, body?: unknown) => peticion<T>(path, { method: 'PUT', body }),
  patch: <T,>(path: string, body?: unknown) => peticion<T>(path, { method: 'PATCH', body }),
  // body opcional (2026-07-20): "Eliminar seleccionadas" en notificaciones
  // manda un array de ids en el body de un DELETE — hasta ahora ningún DELETE
  // de la app lo necesitaba.
  delete: <T,>(path: string, body?: unknown) => peticion<T>(path, { method: 'DELETE', body })
};
