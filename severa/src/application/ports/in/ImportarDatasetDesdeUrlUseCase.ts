import { ResumenImportacion } from './ImportarDatasetUseCase';

export interface ImportarDatasetDesdeUrlUseCase {
  ejecutar(url: string, analistaId: string): Promise<ResumenImportacion>;
}
