import { MarcarTodasLasNotificacionesLeidasUseCase } from '../../ports/in/module_notificaciones_alertas/MarcarTodasLasNotificacionesLeidasUseCase';
import { NotificacionRepository } from '../../ports/out/persistencia/repositorios/NotificacionRepository';

export class MarcarTodasLasNotificacionesLeidas implements MarcarTodasLasNotificacionesLeidasUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(analistaId: string): Promise<number> {
    return this.notificacionRepository.marcarTodasComoLeidas(analistaId);
  }
}
