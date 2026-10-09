import {
  LIMITE_DE_NOTIFICACIONES_POR_DEFECTO,
  LIMITE_MAXIMO_DE_NOTIFICACIONES,
  NotificacionesDelAnalista,
  ObtenerNotificacionesUseCase,
  PaginaDeNotificacionesPedida
} from '../../ports/in/module_notificaciones_alertas/ObtenerNotificacionesUseCase';
import { NotificacionRepository } from '../../ports/out/persistencia/repositorios/NotificacionRepository';

function enteroEntre(valor: number | undefined, minimo: number, maximo: number, porDefecto: number): number {
  if (valor === undefined || !Number.isFinite(valor)) return porDefecto;
  return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}

// RF-103. Siempre devuelve UNA página, nunca todo: el límite se acota acá
// (y no solo en el controlador) para que ningún otro punto de entrada pueda
// pedir el listado completo por descuido.
export class ObtenerNotificaciones implements ObtenerNotificacionesUseCase {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async ejecutar(analistaId: string, pagina: PaginaDeNotificacionesPedida = {}): Promise<NotificacionesDelAnalista> {
    const limite = enteroEntre(pagina.limite, 1, LIMITE_MAXIMO_DE_NOTIFICACIONES, LIMITE_DE_NOTIFICACIONES_POR_DEFECTO);
    const desplazamiento = enteroEntre(pagina.desplazamiento, 0, Number.MAX_SAFE_INTEGER, 0);

    const [notificaciones, conteo] = await Promise.all([
      this.notificacionRepository.listarPorAnalista(analistaId, { limite, desplazamiento }),
      this.notificacionRepository.contarPorAnalista(analistaId)
    ]);

    return { notificaciones, total: conteo.total, noLeidas: conteo.noLeidas, limite, desplazamiento };
  }
}
