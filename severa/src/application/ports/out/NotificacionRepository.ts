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
  // "Marcar todas como leídas" (2026-07-19): un solo UPDATE scopeado por
  // dueño, igual que marcarComoLeida — nunca puede tocar notificaciones de
  // otro analista. Devuelve cuántas se marcaron (0 si ya estaban todas leídas).
  marcarTodasComoLeidas(analistaId: string): Promise<number>;
  // "Eliminar seleccionadas" (2026-07-20): un solo DELETE scopeado por dueño
  // (WHERE id = ANY($1) AND destinatario = $2) — un id de otro analista en
  // la lista simplemente no se borra, no rompe ni informa nada distinto (no
  // se revela si ese id existe). Devuelve cuántas se borraron de verdad.
  eliminarVarias(ids: string[], analistaId: string): Promise<number>;
}
