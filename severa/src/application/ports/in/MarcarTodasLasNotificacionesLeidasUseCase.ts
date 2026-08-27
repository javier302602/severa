export interface MarcarTodasLasNotificacionesLeidasUseCase {
  ejecutar(analistaId: string): Promise<number>;
}
