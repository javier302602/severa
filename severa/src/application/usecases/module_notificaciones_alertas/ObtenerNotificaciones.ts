import { Notificacion } from '../../../domain/entities/Notificacion';
import { ObtenerNotificacionesUseCase } from '../../ports/in/module_notificaciones_alertas/ObtenerNotificacionesUseCase';
import { NotificacionRepository } from '../../ports/out/persistencia/repositorios/NotificacionRepository';

export class ObtenerNotificaciones implements ObtenerNotificacionesUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(analistaId: string): Promise<Notificacion[]> {
    return this.notificacionRepository.listarPorAnalista(analistaId);
  }
}
