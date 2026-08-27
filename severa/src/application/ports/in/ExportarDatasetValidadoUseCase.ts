export interface ExportarDatasetValidadoUseCase {
  ejecutar(analistaId: string): Promise<Buffer>;
}
