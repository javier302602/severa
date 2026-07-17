import { Notificacion } from '../../../domain/entities/Notificacion';

export interface NotificacionRepository {
  guardar(notificacion: Notificacion): Promise<void>;
  listarPorAnalista(analistaId: string): Promise<Notificacion[]>;
  // Recibe analistaId además del id de la notificación (más allá del mínimo
  // pedido) para que el UPDATE quede scopeado por dueño en una sola consulta,
  // igual que busquedaRouter con filtros favoritos desde M-11/M-12: nunca debe
  // ser posible marcar como leída una notificación de otro analista adivinando
  // su id. Devuelve false si el id no existe o no pertenece a ese analista —
  // ambos casos se tratan igual para no revelar si el id existe.
  marcarComoLeida(id: string, analistaId: string): Promise<boolean>;
}
