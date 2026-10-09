import { Notificacion } from '../../../../domain/entities/Notificacion';

// RF-103: el centro de notificaciones se consulta de a páginas.
export const LIMITE_DE_NOTIFICACIONES_POR_DEFECTO = 50;
export const LIMITE_MAXIMO_DE_NOTIFICACIONES = 200;

export interface PaginaDeNotificacionesPedida {
  limite?: number;
  desplazamiento?: number;
}

export interface NotificacionesDelAnalista {
  // De la más reciente a la más antigua.
  notificaciones: Notificacion[];
  // Sobre TODAS las notificaciones del analista, no solo las de esta página:
  // es lo que necesitan el contador del encabezado y el paginado.
  total: number;
  noLeidas: number;
  limite: number;
  desplazamiento: number;
}

export interface ObtenerNotificacionesUseCase {
  ejecutar(analistaId: string, pagina?: PaginaDeNotificacionesPedida): Promise<NotificacionesDelAnalista>;
}
