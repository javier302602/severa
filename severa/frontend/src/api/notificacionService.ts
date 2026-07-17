import { httpClient } from './httpClient';
import type { Notificacion } from '../types/Notificacion';

// Contratos verificados contra NotificacionController.ts.
export const notificacionService = {
  listar: (): Promise<Notificacion[]> => httpClient.get('/notificaciones'),
  marcarComoLeida: (id: string): Promise<void> => httpClient.patch(`/notificaciones/${id}/leida`)
};
