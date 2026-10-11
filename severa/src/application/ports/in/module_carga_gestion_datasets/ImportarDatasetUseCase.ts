import { FilaImportable, FilaRechazada } from '../../../../infrastructure/adapters/out/dataset/parsers/LectorExcelDataset';
import { LecturaDelArchivo } from './AnalizarDatasetGenericoUseCase';

export interface ResumenImportacion {
  importados: number;
  rechazados: number;
  errores: string[];
  // .xlsx de las filas descartadas (columnas originales + "Motivo del
  // rechazo"), codificado en base64 para viajar dentro del mismo JSON de
  // respuesta — null si no hubo ninguna fila rechazada. Ver
  // construirExcelDeRechazadas (LectorExcelDataset.ts) y
  // MAX_FILAS_RECHAZADAS_PARA_EXCEL: en datasets con muchísimos rechazos,
  // el Excel es una muestra representativa, no necesariamente completa —
  // `rechazados` siempre es el conteo real.
  excelDescartadosBase64: string | null;
  // Solo al importar un .csv/.tsv: codificación, separador y convención
  // decimal con que se leyó, y las columnas que quedaron como texto.
  lectura?: LecturaDelArchivo;
}

export interface ImportarDatasetUseCase {
  ejecutar(
    resultado: { importables: FilaImportable[]; rechazadas: FilaRechazada[]; errores?: string[] } | undefined,
    analistaId: string
  ): Promise<ResumenImportacion>;
}
