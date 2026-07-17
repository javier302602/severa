import { MarcarNotificacionLeidaUseCase } from '../ports/in/MarcarNotificacionLeidaUseCase';
import { NotificacionRepository } from '../ports/out/NotificacionRepository';

export class MarcarNotificacionLeida implements MarcarNotificacionLeidaUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(id: string, analistaId: string): Promise<boolean> {
    return this.notificacionRepository.marcarComoLeida(id, analistaId);
  }
}
