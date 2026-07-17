import { Notificacion } from '../../domain/entities/Notificacion';
import { ObtenerNotificacionesUseCase } from '../ports/in/ObtenerNotificacionesUseCase';
import { NotificacionRepository } from '../ports/out/NotificacionRepository';

export class ObtenerNotificaciones implements ObtenerNotificacionesUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(analistaId: string): Promise<Notificacion[]> {
    return this.notificacionRepository.listarPorAnalista(analistaId);
  }
}
