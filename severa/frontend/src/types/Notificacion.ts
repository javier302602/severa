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
