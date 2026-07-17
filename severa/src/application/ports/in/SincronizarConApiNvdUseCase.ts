export interface SincronizarConApiNvdUseCase {
  ejecutar(analistaId: string): Promise<{ importados: number; rechazados: number; errores: string[] }>;
}
