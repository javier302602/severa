// Única fuente de verdad para las rutas del cliente — evita strings mágicos
// repetidos entre el router, el Sidebar y los redirects.
export const RUTAS = {
  login: '/login',
  registro: '/registro',
  perfil: '/perfil',
  dataset: '/dataset',
  analisisDatos: '/analisis-datos',
  catalogo: '/catalogo',
  vulnerabilidadDetalle: (cve: string) => `/catalogo/${cve}`,
  estadisticas: '/estadisticas',
  estadisticasFrecuencias: '/estadisticas/frecuencias',
  graficos: '/graficos',
  comparacion: '/comparacion',
  priorizacion: '/priorizacion',
  informes: '/informes',
  busqueda: '/busqueda',
  auditoria: '/auditoria',
  notificaciones: '/notificaciones',
  comoFunciona: '/como-funciona'
} as const;
