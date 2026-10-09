import { CandidataAVariableObjetivo } from '../../../../domain/services/variable-detection/VariableObjetivoGenerico';
import { DecisionVariableObjetivo } from '../../../../domain/entities/DatasetGenerico';

export interface EstadoDeVariableObjetivo {
  // Lo que sugiere el sistema (puede estar vacío).
  candidatas: CandidataAVariableObjetivo[];
  nota: string;
  // Lo que decidió el analista. 'pendiente' mientras no haya respondido.
  decision: DecisionVariableObjetivo;
  // Columnas que se pueden elegir a mano, sean o no candidatas.
  columnasElegibles: string[];
}

// RF-110. analistaId siempre del token.
export interface SugerirVariableObjetivoUseCase {
  ejecutar(analistaId: string, sesionId: string): Promise<EstadoDeVariableObjetivo>;
}

export interface ResultadoDefinicionDeVariableObjetivo {
  decision: DecisionVariableObjetivo;
  anterior: DecisionVariableObjetivo;
  // false si la decisión es la misma que ya estaba guardada.
  huboCambio: boolean;
  // Dataset sobre el que se decidió (para la auditoría, RF-138).
  datasetOriginalId: string;
  nombreArchivo: string;
  version: number;
}

// RF-110: el analista confirma una columna (una candidata u otra cualquiera
// que sea elegible) o, con columna null, rechaza tener variable objetivo.
export interface DefinirVariableObjetivoUseCase {
  ejecutar(analistaId: string, sesionId: string, columna: string | null): Promise<ResultadoDefinicionDeVariableObjetivo>;
}
