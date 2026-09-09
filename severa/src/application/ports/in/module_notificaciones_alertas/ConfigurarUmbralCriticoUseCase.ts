export interface ConfigurarUmbralCriticoUseCase {
  ejecutar(analistaId: string, variable: string, valor: number): Promise<void>;
}
