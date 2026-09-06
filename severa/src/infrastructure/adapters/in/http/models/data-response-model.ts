// Modelo común para estandarizar la respuesta exitosa de la API (ver
// docs/Arquitectura de SEVERA.md, sección III). Placeholder: ningún
// controller lo usa todavía — cada uno arma su propio res.json(...) inline.
// No cambiar ningún controller para adoptarlo sin que se pida explícitamente.
export interface DataResponseModel<T> {
  data: T;
}
