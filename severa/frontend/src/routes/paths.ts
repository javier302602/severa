// Única fuente de verdad para las rutas del cliente — evita strings mágicos
// repetidos entre el router, el Sidebar y los redirects.
export const RUTAS = {
  login: '/login',
  registro: '/registro',
  perfil: '/perfil',
  historial: '/historial',
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

// RF-28 / RF-69: ancla de la sección de Perfil donde se configura la escala
// de niveles de riesgo. Cada rótulo "Escala: …" de las pantallas lleva acá.
export const ANCLA_ESCALA = 'escala-de-clasificacion';
export const RUTA_CONFIGURAR_ESCALA = `${RUTAS.perfil}#${ANCLA_ESCALA}`;
