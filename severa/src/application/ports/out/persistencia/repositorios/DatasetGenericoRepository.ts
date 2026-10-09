import { DatasetGenerico, DecisionVariableObjetivo } from '../../../../../domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../../../domain/entities/RegistroDatasetGenerico';
import { EntradaDeBitacoraDeDataset, OperacionDeBitacora } from '../../../../../domain/entities/EntradaDeBitacoraDeDataset';
import { CriterioDeClasificacionValue } from '../../../../../domain/shared/value-objects/CriterioDeClasificacion';
import { CorreccionesDeTipo } from '../../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';

// Una operación a anotar en la bitácora (RF-123). El repositorio le pone id;
// fecha, analista y versiones los fija quien la registra.
export interface OperacionParaBitacora {
  operacion: OperacionDeBitacora;
  variable: string | null;
  registrosAfectados: number;
  metodo: string;
  detalle?: Record<string, unknown>;
}

// RF-136: todo lo necesario para guardar una versión procesada. `base` es el
// dataset sobre el que se trabajó (el original u otra versión); la versión
// nueva pertenece a la misma familia y recibe el número siguiente.
export interface NuevaVersionProcesada {
  base: DatasetGenerico;
  columnas: string[];
  filas: Array<Record<string, unknown>>;
  filasDuplicadas: number;
  tiposCorregidos: CorreccionesDeTipo;
  operaciones: OperacionParaBitacora[];
  fecha: Date;
}

// Multi-tenancy a nivel de dueño (mismo criterio que VulnerabilidadRepository):
// TODOS los métodos reciben analistaId y filtran por él en el SQL — un id de
// otro analista se trata igual que uno inexistente, nunca se distingue (ver
// DatasetGenericoNoEncontradoError).
//
// RF-137 (protección del original): esta interfaz no tiene, a propósito,
// ningún método que modifique o reemplace los registros de un dataset ni su
// lista de columnas. Lo único que se puede cambiar de un dataset ya cargado
// es su configuración (criterio, tipos corregidos, variable objetivo). Toda
// transformación pasa por crearVersionProcesada, que solo sabe insertar un
// dataset nuevo. La base de datos refuerza lo mismo con disparadores
// (migración 016).
export interface DatasetGenericoRepository {
  guardar(dataset: DatasetGenerico): Promise<void>;
  // Un solo INSERT multi-VALUES por llamada (mismo contrato que
  // VulnerabilidadRepository.guardarLote) — el llamador decide el tamaño del
  // lote (ver AnalizarDatasetGenerico.ts).
  guardarRegistros(registros: RegistroDatasetGenerico[]): Promise<void>;
  buscarPorId(id: string, analistaId: string): Promise<DatasetGenerico | null>;
  // En el orden del archivo (ver RegistroDatasetGenerico.posicion).
  listarRegistros(datasetId: string, analistaId: string): Promise<RegistroDatasetGenerico[]>;
  // RF-139 + pendiente de M-03 (migración 012): método dedicado, mismo
  // criterio que VulnerabilidadRepository.actualizarEstado — un update
  // acotado a estos dos campos, no un guardar() genérico que reescriba todo
  // el dataset. columnaClave viaja aparte de criterioClasificacion porque el
  // caso de uso puede recibir uno solo de los dos en el PATCH.
  actualizarCriterioClasificacion(
    id: string,
    analistaId: string,
    criterioClasificacion: CriterioDeClasificacionValue,
    columnaClave: string | null
  ): Promise<void>;

  // RF-111.
  actualizarTiposCorregidos(id: string, analistaId: string, tiposCorregidos: CorreccionesDeTipo): Promise<void>;
  // RF-110.
  actualizarVariableObjetivo(id: string, analistaId: string, decision: DecisionVariableObjetivo): Promise<void>;

  // Todos los datasets del analista —originales y versiones procesadas—, sin
  // sus registros. Quien llama los agrupa por familia (idDelOriginal).
  listarTodos(analistaId: string): Promise<DatasetGenerico[]>;
  // RF-136: el original y todas sus versiones procesadas, de la 0 en adelante.
  // Recibe el id del original (DatasetGenerico.idDelOriginal).
  listarVersiones(datasetOriginalId: string, analistaId: string): Promise<DatasetGenerico[]>;
  // RF-136/RF-123: guarda la versión nueva, sus registros y sus entradas de
  // bitácora como una sola operación — o queda todo, o no queda nada. Asigna
  // el número de versión y devuelve el dataset creado. Lanza
  // DatasetGenericoNoEncontradoError si `base` ya no existe para ese analista.
  crearVersionProcesada(nueva: NuevaVersionProcesada): Promise<DatasetGenerico>;

  // RF-123: operaciones que no generan una versión (RF-110, RF-111).
  registrarEnBitacora(dataset: DatasetGenerico, operaciones: OperacionParaBitacora[], fecha: Date): Promise<void>;
  // Toda la historia de la familia, en orden cronológico.
  listarBitacora(datasetOriginalId: string, analistaId: string): Promise<EntradaDeBitacoraDeDataset[]>;
}
