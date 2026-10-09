import { Notificacion } from '../../../../../domain/entities/Notificacion';

// Qué tramo de las notificaciones de un analista se pide, de la más reciente
// a la más antigua.
export interface PaginaDeNotificaciones {
  limite: number;
  desplazamiento: number;
}

export interface ConteoDeNotificaciones {
  total: number;
  noLeidas: number;
}

export interface NotificacionRepository {
  guardar(notificacion: Notificacion): Promise<void>;
  // Sin `pagina` devuelve todas. La pantalla y la API siempre piden una
  // página (ver ObtenerNotificaciones): un analista puede acumular decenas de
  // miles y traerlas todas juntas llegó a colgar el navegador.
  listarPorAnalista(analistaId: string, pagina?: PaginaDeNotificaciones): Promise<Notificacion[]>;
  contarPorAnalista(analistaId: string): Promise<ConteoDeNotificaciones>;
  marcarComoLeida(id: string, analistaId: string): Promise<boolean>;
  marcarTodasComoLeidas(analistaId: string): Promise<number>;
  eliminarVarias(ids: string[], analistaId: string): Promise<number>;
  // Borra todas las notificaciones ya leídas del analista (no las no leídas).
  eliminarLeidas(analistaId: string): Promise<number>;
}
