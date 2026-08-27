import { ResumenImportacion } from './ImportarDatasetUseCase';
import { MapeoColumnas } from '../../../infrastructure/adapters/out/dataset/LectorExcelDataset';

export interface ImportarDatasetDesdeUrlUseCase {
  // mapeoColumnas (2026-07-17): ningún dataset público real (CISA, NVD/CISA/
  // EPSS enriquecido de Kaggle, etc.) trae las columnas con los nombres
  // exactos que espera SEVERA por defecto — mismo mapeo flexible que ya
  // existe para "subir archivo" (DatasetController.ts /dataset/columnas),
  // ahora también disponible para "importar desde link".
  ejecutar(url: string, analistaId: string, mapeoColumnas?: MapeoColumnas): Promise<ResumenImportacion>;
}
