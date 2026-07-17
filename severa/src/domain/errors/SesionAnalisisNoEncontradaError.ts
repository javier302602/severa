// Mejora 4 (Análisis de Datos General) — Fase 3. Un solo mensaje/status para
// tres causas distintas (sesionId inexistente, expirado, o de otro
// analista): igual criterio IDOR ya establecido en Sprint 11/12 (nunca
// confiar en un id sin verificar dueño) — 404 en los tres casos, nunca 403,
// para no revelarle a quien ataca que el id existe pero pertenece a otra
// cuenta.
export class SesionAnalisisNoEncontradaError extends Error {
  constructor(message = 'Sesión de análisis no encontrada o expirada, volvé a subir el archivo') {
    super(message);
    this.name = 'SesionAnalisisNoEncontradaError';
  }
}
