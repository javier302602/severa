export interface EliminarNotificacionesLeidasUseCase {
  // Devuelve cuántas se eliminaron.
  ejecutar(analistaId: string): Promise<number>;
}
