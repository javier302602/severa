import { httpClient } from './httpClient';
import type { PaginaDeNotificaciones } from '../types/Notificacion';

// Cuántas notificaciones se piden por página (el backend acepta hasta 200).
export const NOTIFICACIONES_POR_PAGINA = 50;

// Contratos verificados contra NotificacionController.ts.
export const notificacionService = {
  // Una página de notificaciones, de la más reciente a la más antigua.
  listar: (pagina = 0): Promise<PaginaDeNotificaciones> =>
    httpClient.get('/notificaciones', { limite: NOTIFICACIONES_POR_PAGINA, desplazamiento: pagina * NOTIFICACIONES_POR_PAGINA }),
  marcarComoLeida: (id: string): Promise<void> => httpClient.patch(`/notificaciones/${id}/leida`),
  marcarTodasComoLeidas: (): Promise<{ marcadas: number }> => httpClient.patch('/notificaciones/marcar-todas-leidas'),
  // "Eliminar seleccionadas" (2026-07-20).
  eliminarVarias: (ids: string[]): Promise<{ eliminadas: number }> => httpClient.delete('/notificaciones', { ids }),
  // Elimina todas las notificaciones ya leídas (RF-104).
  eliminarLeidas: (): Promise<{ eliminadas: number }> => httpClient.delete('/notificaciones/leidas')
};
