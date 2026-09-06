export interface MarcarNotificacionLeidaUseCase {
  ejecutar(id: string, analistaId: string): Promise<boolean>;
}
