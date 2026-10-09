import { ListarDatasetsGenericosUseCase, ResumenDeDataset } from '../../ports/in/module_carga_gestion_datasets/DatasetsGenericosUseCases';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../../domain/entities/DatasetGenerico';

// Los datasets que el analista cargó, del más reciente al más antiguo, cada
// uno con su cantidad de versiones procesadas. Es la puerta de entrada para
// volver a un dataset cuando la sesión de análisis ya expiró (RF-136).
export class ListarDatasetsGenericos implements ListarDatasetsGenericosUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(analistaId: string): Promise<ResumenDeDataset[]> {
    const todos = await this.datasetGenericoRepository.listarTodos(analistaId);

    const familias = new Map<string, DatasetGenerico[]>();
    todos.forEach((dataset) => {
      const familia = familias.get(dataset.idDelOriginal) ?? [];
      familia.push(dataset);
      familias.set(dataset.idDelOriginal, familia);
    });

    const resumenes: ResumenDeDataset[] = [];
    familias.forEach((familia, datasetOriginalId) => {
      const original = familia.find((dataset) => dataset.esOriginal);
      // Una versión cuyo original no vino en la consulta no puede ocurrir (la
      // base las borra en cascada), pero si ocurriera no se inventa una fila.
      if (!original) return;
      const ultima = familia.reduce((mayor, dataset) => (dataset.version > mayor.version ? dataset : mayor));
      resumenes.push({
        datasetOriginalId,
        nombreArchivo: original.nombreArchivo,
        fechaCarga: original.fechaCarga,
        totalFilas: original.totalFilas,
        totalColumnas: original.columnas.length,
        versionesProcesadas: familia.length - 1,
        ultimaVersion: { datasetId: ultima.id, version: ultima.version, fecha: ultima.fechaCarga }
      });
    });

    return resumenes.sort((a, b) => b.fechaCarga.getTime() - a.fechaCarga.getTime());
  }
}
