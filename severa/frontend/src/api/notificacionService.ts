import { httpClient } from './httpClient';
import type { Notificacion } from '../types/Notificacion';

// Contratos verificados contra NotificacionController.ts.
export const notificacionService = {
  listar: (): Promise<Notificacion[]> => httpClient.get('/notificaciones'),
  marcarComoLeida: (id: string): Promise<void> => httpClient.patch(`/notificaciones/${id}/leida`),
  marcarTodasComoLeidas: (): Promise<{ marcadas: number }> => httpClient.patch('/notificaciones/marcar-todas-leidas'),
  // "Eliminar seleccionadas" (2026-07-20).
  eliminarVarias: (ids: string[]): Promise<{ eliminadas: number }> => httpClient.delete('/notificaciones', { ids })
};
