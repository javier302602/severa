// El archivo exportado y de qué dataset salió (para nombrarlo y para la
// auditoría, RF-138).
export interface DatasetExportado {
  contenido: Buffer;
  datasetOriginalId: string;
  nombreArchivo: string;
  version: number;
  totalFilas: number;
}

export interface ExportarDatasetGenericoUseCase {
  // analistaId SIEMPRE del token — lanza DatasetGenericoNoEncontradoError si
  // el datasetId no existe o pertenece a otro analista (mismo criterio en
  // ambos casos, ver el error). datasetId puede ser el del original o el de
  // cualquier versión procesada: se exporta exactamente ese.
  ejecutar(datasetId: string, analistaId: string): Promise<DatasetExportado>;
}
