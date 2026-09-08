export interface ResultadoVerificacionIntegridad {
  coincide: boolean;
  hashActual: string;
  hashOriginal: string | null;
}

export interface VerificarIntegridadDatasetUseCase {
  // Lanza DatasetGenericoNoEncontradoError si el dataset no existe o es de
  // otro analista (mismo criterio IDOR que ExportarDatasetGenerico.ts).
  // hashOriginal null (datasets importados antes de la migración 013) implica
  // coincide=false siempre — no hay nada contra qué comparar, y "no se puede
  // verificar" no es lo mismo que "coincide". rutaArchivoAVerificar: mismo
  // patrón que AnalizarDatasetGenericoUseCase — un path en disco (multer
  // diskStorage), no un Buffer completo en memoria (ver calcularHashSha256Archivo).
  ejecutar(datasetId: string, analistaId: string, rutaArchivoAVerificar: string): Promise<ResultadoVerificacionIntegridad>;
}
