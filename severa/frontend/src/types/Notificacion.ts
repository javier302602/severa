// Refleja la respuesta real de GET /notificaciones (NotificacionController.ts).
export type TipoNotificacion =
  | 'VulnerabilidadCritica'
  | 'PlazoVencido'
  // RF-100: aviso previo al vencimiento del plazo de remediación.
  | 'PlazoProximoAVencer'
  | 'InformeListo'
  | 'ActualizacionNVD'
  | 'ImportacionCompletada'
  // RF-16: cambio en los datos del propio perfil.
  | 'PerfilActualizado'
  // RF-122: resumen único de una limpieza de dataset.
  | 'LimpiezaCompletada';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  leida: boolean;
  fecha: string;
  mensaje: string;
}

// GET /notificaciones devuelve una página, más el total y la cantidad de no
// leídas de TODO el centro de notificaciones (no solo de la página).
export interface PaginaDeNotificaciones {
  notificaciones: Notificacion[];
  total: number;
  noLeidas: number;
  limite: number;
  desplazamiento: number;
}
