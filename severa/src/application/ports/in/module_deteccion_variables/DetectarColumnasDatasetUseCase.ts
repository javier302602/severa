export interface DetectarColumnasDatasetUseCase {
  ejecutar(rutaArchivo: string): Promise<string[]>;
}
