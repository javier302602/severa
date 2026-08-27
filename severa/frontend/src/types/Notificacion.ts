// Refleja la respuesta real de GET /notificaciones (NotificacionController.ts).
export type TipoNotificacion = 'VulnerabilidadCritica' | 'PlazoVencido' | 'InformeListo' | 'ActualizacionNVD' | 'ImportacionCompletada';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  leida: boolean;
  fecha: string;
  mensaje: string;
}
