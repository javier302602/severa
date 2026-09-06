// Modelo común para estandarizar los mensajes de error de la API (ver
// docs/Arquitectura de SEVERA.md, sección III). Placeholder: ningún
// controller ni el error-handler global de app.ts lo usa todavía — hoy
// responden con { error: string } armado inline. No cambiar ese
// comportamiento para adoptarlo sin que se pida explícitamente.
export interface ErrorResponseModel {
  error: string;
}
