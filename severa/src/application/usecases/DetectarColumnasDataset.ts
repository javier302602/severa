import { LectorExcelDataset } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { DetectarColumnasDatasetUseCase } from '../ports/in/DetectarColumnasDatasetUseCase';

// Mejora "mapeo flexible de columnas": el frontend llama a esto apenas el
// usuario elige el archivo (antes de importar nada) para poder mostrarle un
// selector con los nombres de columna reales de SU archivo, en vez de
// exigirle de entrada los nombres exactos que espera el dataset de
// referencia del SDS.
export class DetectarColumnasDataset implements DetectarColumnasDatasetUseCase {
  constructor(private readonly lectorExcel: LectorExcelDataset) {}

  ejecutar(rutaArchivo: string): Promise<string[]> {
    return this.lectorExcel.detectarColumnas(rutaArchivo);
  }
}
