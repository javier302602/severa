// Modelo común para estandarizar respuestas paginadas de la API (ver
// docs/Arquitectura de SEVERA.md, sección III). Placeholder: ningún
// controller lo usa todavía (p. ej. BusquedaController pagina con
// "limite"/"offset" propios, inline). No cambiar ningún controller para
// adoptarlo sin que se pida explícitamente.
export interface PaginatedResponseModel<T> {
  data: T[];
  pagina: number;
  limite: number;
  total: number;
}
