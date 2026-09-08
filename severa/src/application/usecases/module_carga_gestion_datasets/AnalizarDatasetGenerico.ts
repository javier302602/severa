import { randomUUID } from 'crypto';
import { LectorDatasetGenerico } from '../../../infrastructure/adapters/out/dataset/parsers/LectorDatasetGenerico';
import { AnalizarDatasetGenericoUseCase, ResultadoAnalisisDataset } from '../../ports/in/module_carga_gestion_datasets/AnalizarDatasetGenericoUseCase';
import { analizarDataset } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../../domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../domain/entities/RegistroDatasetGenerico';
import { calcularHashSha256Archivo } from '../../utils/CalcularHashSha256Archivo';

// Tamaño de lote para guardarRegistros() — mismo criterio que ImportarDataset.ts
// (TAMANO_DE_LOTE): con JSONB por fila hay incluso más margen (5 parámetros
// por fila acá vs. 10 en vulnerabilidades), pero se mantiene el mismo número
// por consistencia, no por necesidad de ajustarlo.
const TAMANO_DE_LOTE = 1000;

// Mejora 4 — Fase 2, generalizada para persistir (M-03). Sin persistencia
// en base de datos era la decisión de v1: ahora además de crear la sesión
// efímera (Fase 3/4/5 siguen leyendo de ahí sin cambios) también persiste el
// dataset completo en datasets_genericos/registros_datasets_genericos, para
// que sobreviva más allá de los 30 minutos de TTL y pueda exportarse
// (RF-24) o quedar en un historial futuro.
export class AnalizarDatasetGenerico implements AnalizarDatasetGenericoUseCase {
  constructor(
    private readonly lectorDatasetGenerico: LectorDatasetGenerico,
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async ejecutar(rutaArchivo: string, analistaId: string, nombreArchivoOriginal: string): Promise<ResultadoAnalisisDataset> {
    // RF-135: se calcula ANTES de parsear, sobre el archivo tal como llegó —
    // el controller solo borra rutaArchivo en su finally, después de que este
    // método termina, así que el archivo sigue existiendo en disco acá.
    const hashOriginalSha256 = await calcularHashSha256Archivo(rutaArchivo);
    const { columnas, filas } = this.lectorDatasetGenerico.leerArchivo(rutaArchivo);
    const diagnostico = analizarDataset(columnas, filas);
    const sesionId = this.sesionAnalisisStore.crear(analistaId, { columnas, filas });

    const datasetId = randomUUID();
    await this.datasetGenericoRepository.guardar(
      new DatasetGenerico(
        datasetId, analistaId, nombreArchivoOriginal, columnas, 'archivo', null, diagnostico.filasDuplicadas,
        new Date(), null, null, hashOriginalSha256
      )
    );

    for (let inicio = 0; inicio < filas.length; inicio += TAMANO_DE_LOTE) {
      const lote = filas
        .slice(inicio, inicio + TAMANO_DE_LOTE)
        .map((valores) => new RegistroDatasetGenerico(randomUUID(), datasetId, analistaId, valores));
      await this.datasetGenericoRepository.guardarRegistros(lote);
    }

    return { diagnostico, sesionId, datasetId };
  }
}
