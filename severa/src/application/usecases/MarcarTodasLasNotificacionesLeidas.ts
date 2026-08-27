import { MarcarTodasLasNotificacionesLeidasUseCase } from '../ports/in/MarcarTodasLasNotificacionesLeidasUseCase';
import { NotificacionRepository } from '../ports/out/NotificacionRepository';

export class MarcarTodasLasNotificacionesLeidas implements MarcarTodasLasNotificacionesLeidasUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(analistaId: string): Promise<number> {
    return this.notificacionRepository.marcarTodasComoLeidas(analistaId);
  }
}
