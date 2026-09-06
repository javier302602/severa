import { LectorDatasetGenerico } from '../../../infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { AnalizarDatasetGenericoUseCase, ResultadoAnalisisDataset } from '../../ports/in/module_carga_gestion_datasets/AnalizarDatasetGenericoUseCase';
import { analizarDataset } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';

// Mejora 4 — Fase 2. Mismo patrón que ImportarDatasetDesdeArchivo.ts: el
// lector se inyecta como clase concreta, no detrás de un puerto propio
// (convención ya establecida en este proyecto para los lectores de
// archivo). Sin persistencia en base de datos (decisión confirmada para
// v1): el diagnóstico se recalcula en el momento a partir del archivo
// subido. Fase 3: las filas ya parseadas SÍ quedan guardadas, pero en el
// store efímero (memoria del proceso, TTL 30 min), no en la base de datos —
// para que las rutas de estadísticas/análisis univariado no tengan que
// volver a mandar el archivo ni reparsearlo.
export class AnalizarDatasetGenerico implements AnalizarDatasetGenericoUseCase {
  constructor(
    private readonly lectorDatasetGenerico: LectorDatasetGenerico,
    private readonly sesionAnalisisStore: SesionAnalisisStore
  ) {}

  async ejecutar(rutaArchivo: string, analistaId: string): Promise<ResultadoAnalisisDataset> {
    const { columnas, filas } = this.lectorDatasetGenerico.leerArchivo(rutaArchivo);
    const diagnostico = analizarDataset(columnas, filas);
    const sesionId = this.sesionAnalisisStore.crear(analistaId, { columnas, filas });
    return { diagnostico, sesionId };
  }
}
