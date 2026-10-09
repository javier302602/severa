import { CorreccionesDeTipo, TipoColumnaDetallado } from '../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { DiagnosticoDataset } from '../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { ResumenColumna } from '../../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';

export interface ResultadoCorreccionDeTipo {
  // Dataset sobre el que se corrigió (para la auditoría, RF-138).
  datasetOriginalId: string;
  nombreArchivo: string;
  version: number;
  // false si el tipo pedido es el que ya estaba vigente: no se guardó nada.
  huboCambio: boolean;
  columna: string;
  tipoAnterior: TipoColumnaDetallado;
  tipoVigente: TipoColumnaDetallado;
  tipoDetectado: TipoColumnaDetallado;
  // Todas las correcciones vigentes del dataset después del cambio.
  tiposCorregidos: CorreccionesDeTipo;
  // Recalculados con el tipo nuevo, para que quien llama no tenga que pedirlos.
  diagnostico: DiagnosticoDataset;
  perfilVariables: ResumenColumna[];
}

// RF-111. analistaId siempre del token. tipo null = volver al tipo detectado.
export interface CorregirTipoDeVariableUseCase {
  ejecutar(analistaId: string, sesionId: string, columna: string, tipo: TipoColumnaDetallado | null): Promise<ResultadoCorreccionDeTipo>;
}
