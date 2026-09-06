import { EliminarNotificacionesUseCase } from '../../ports/in/module_notificaciones_alertas/EliminarNotificacionesUseCase';
import { NotificacionRepository } from '../../ports/out/persistencia/repositorios/NotificacionRepository';

export class EliminarNotificaciones implements EliminarNotificacionesUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(ids: string[], analistaId: string): Promise<number> {
    return this.notificacionRepository.eliminarVarias(ids, analistaId);
  }
}
