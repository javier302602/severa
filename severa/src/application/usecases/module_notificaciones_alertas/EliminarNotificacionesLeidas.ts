import { EliminarNotificacionesLeidasUseCase } from '../../ports/in/module_notificaciones_alertas/EliminarNotificacionesLeidasUseCase';
import { NotificacionRepository } from '../../ports/out/persistencia/repositorios/NotificacionRepository';

// RF-104 ("mantener organizado mi centro de notificaciones"): vaciar de una
// vez todo lo ya leído. "Eliminar seleccionadas" borra de a una página; con
// miles de notificaciones acumuladas eso no alcanza para limpiar el centro.
export class EliminarNotificacionesLeidas implements EliminarNotificacionesLeidasUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(analistaId: string): Promise<number> {
    return this.notificacionRepository.eliminarLeidas(analistaId);
  }
}
