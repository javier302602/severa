export interface EliminarNotificacionesUseCase {
  ejecutar(ids: string[], analistaId: string): Promise<number>;
}
