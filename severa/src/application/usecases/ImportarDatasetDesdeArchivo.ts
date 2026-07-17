import { LectorExcelDataset, MapeoColumnas } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetDesdeArchivoUseCase } from '../ports/in/ImportarDatasetDesdeArchivoUseCase';
import { ResumenImportacion } from '../ports/in/ImportarDatasetUseCase';
import { ImportarDatasetConAuditoria } from './auditoria/ImportarDatasetConAuditoria';

// RF-17: primera ruta HTTP que permite importar el dataset manualmente (antes
// solo era alcanzable indirectamente vía SincronizarConApiNvd — hueco
// reportado en Sprints 12/13). Mismo patrón de orquestación que
// SincronizarConApiNvd: lee el archivo con LectorExcelDataset y delega el
// resultado ya parseado al caso de uso auditado/notificado. Deliberadamente
// NO cambia la firma de ImportarDatasetConAuditoria (que sigue sin saber de
// dónde vino el dataset — Excel subido a mano o descargado de NVD); ese
// desacoplamiento es justo lo que permite compartir la misma instancia
// auditada entre las tres vías de importación.
export class ImportarDatasetDesdeArchivo implements ImportarDatasetDesdeArchivoUseCase {
  constructor(
    private readonly lectorExcel: LectorExcelDataset,
    private readonly importarDatasetUseCase: ImportarDatasetConAuditoria
  ) {}

  async ejecutar(
    rutaArchivo: string,
    analistaId: string,
    mapeoColumnas?: MapeoColumnas,
    nombreArchivoOriginal?: string
  ): Promise<ResumenImportacion> {
    const resultado = await this.lectorExcel.leerArchivo(rutaArchivo, mapeoColumnas);
    return this.importarDatasetUseCase.ejecutar(resultado, analistaId, nombreArchivoOriginal);
  }
}
