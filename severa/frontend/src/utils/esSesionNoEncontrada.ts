import { HttpError } from '../api/httpClient';

// Mejora 4 (Análisis de Datos General). Todas las rutas de
// AnalisisDatasetController.ts que reciben un sesionId devuelven 404 (nunca
// 403) para tres causas indistinguibles a propósito: sesionId inexistente,
// expirado (TTL de 30 min), o de otro analista — ver
// SesionAnalisisStoreEnMemoria.ts. Como no hay otra fuente de 404 en este
// módulo, alcanza con mirar el status.
export function esSesionNoEncontrada(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}
