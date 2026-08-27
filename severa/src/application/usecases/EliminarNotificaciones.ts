import { EliminarNotificacionesUseCase } from '../ports/in/EliminarNotificacionesUseCase';
import { NotificacionRepository } from '../ports/out/NotificacionRepository';

export class EliminarNotificaciones implements EliminarNotificacionesUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(ids: string[], analistaId: string): Promise<number> {
    return this.notificacionRepository.eliminarVarias(ids, analistaId);
  }
}
