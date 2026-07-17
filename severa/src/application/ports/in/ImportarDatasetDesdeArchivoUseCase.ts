import { ResumenImportacion } from './ImportarDatasetUseCase';
import { MapeoColumnas } from '../../../infrastructure/adapters/out/dataset/LectorExcelDataset';

export interface ImportarDatasetDesdeArchivoUseCase {
  ejecutar(
    rutaArchivo: string,
    analistaId: string,
    mapeoColumnas?: MapeoColumnas,
    nombreArchivoOriginal?: string
  ): Promise<ResumenImportacion>;
}
