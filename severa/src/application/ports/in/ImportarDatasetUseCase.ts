import { FilaImportable, FilaRechazada } from '../../../infrastructure/adapters/out/dataset/LectorExcelDataset';

export interface ResumenImportacion {
  importados: number;
  rechazados: number;
  errores: string[];
}

export interface ImportarDatasetUseCase {
  ejecutar(
    resultado: { importables: FilaImportable[]; rechazadas: FilaRechazada[]; errores?: string[] } | undefined
  ): Promise<ResumenImportacion>;
}
