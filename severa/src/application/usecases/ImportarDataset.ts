import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { DatasetInvalidoError } from '../../domain/errors/DatasetInvalidoError';
import { FilaImportable, FilaRechazada, construirExcelDeRechazadas } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetUseCase, ResumenImportacion } from '../ports/in/ImportarDatasetUseCase';

// Tamaño de lote para guardarLote() — mismo criterio en todo el módulo (ver
// también LectorExcelDataset.leerArchivoCsvEnStreaming): suficientemente
// grande para amortizar el round-trip a la base, suficientemente chico para
// no acercarse al límite real de parámetros de Postgres (65535; a 10
// columnas por fila, 1000 filas = 10000 parámetros, con margen de sobra).
const TAMANO_DE_LOTE = 1000;

export class ImportarDataset implements ImportarDatasetUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(
    resultado: { importables: FilaImportable[]; rechazadas: FilaRechazada[]; errores?: string[] } | undefined,
    analistaId: string
  ): Promise<ResumenImportacion> {
    if (!resultado) {
      throw new DatasetInvalidoError('No se recibió un resultado de lectura del dataset');
    }

    const importables = resultado.importables ?? [];
    const rechazadas = resultado.rechazadas ?? [];

    // Inserción por lotes (2026-07-17): antes esto llamaba guardar() una vez
    // por fila (un round-trip a la base por vulnerabilidad) — con datasets de
    // cientos de miles de filas eso es el cuello de botella real. guardarLote
    // hace un solo INSERT multi-VALUES por lote.
    for (let inicio = 0; inicio < importables.length; inicio += TAMANO_DE_LOTE) {
      const lote = importables
        .slice(inicio, inicio + TAMANO_DE_LOTE)
        .map((item) => item.vulnerabilidad.asignarAnalista(analistaId));
      await this.vulnerabilidadRepository.guardarLote(lote);
    }

    return {
      importados: importables.length,
      rechazados: rechazadas.length,
      errores: [...(resultado.errores ?? []), ...rechazadas.map((r) => r.error)],
      excelDescartadosBase64: rechazadas.length > 0 ? construirExcelDeRechazadas(rechazadas).toString('base64') : null
    };
  }
}
