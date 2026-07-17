import { Notificacion } from '../../../domain/entities/Notificacion';

export interface ObtenerNotificacionesUseCase {
  ejecutar(analistaId: string): Promise<Notificacion[]>;
}
