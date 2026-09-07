export interface ExportarDatasetGenericoUseCase {
  // analistaId SIEMPRE del token — lanza DatasetGenericoNoEncontradoError si
  // el datasetId no existe o pertenece a otro analista (mismo criterio en
  // ambos casos, ver el error).
  ejecutar(datasetId: string, analistaId: string): Promise<Buffer>;
}
