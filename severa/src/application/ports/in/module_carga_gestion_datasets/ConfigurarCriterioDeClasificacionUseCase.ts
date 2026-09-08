import { DatasetGenerico } from '../../../../domain/entities/DatasetGenerico';
import { UmbralDeClasificacion, TipoDeCriterioClasificacion } from '../../../../domain/shared/value-objects/CriterioDeClasificacion';

// RF-139: input del PATCH /analisis-datos/:datasetId/criterio-clasificacion.
// `tipo` debe ser consistente con lo que DetectorDeTipoDeColumna detecta
// sobre los valores reales de `nombreColumna` (numerica -> umbrales,
// categorica -> ordinal con ordenCategorias) — la validación vive en el caso
// de uso, no acá.
export interface ConfigurarCriterioDeClasificacionInput {
  nombreColumna: string;
  tipo: TipoDeCriterioClasificacion;
  umbrales?: UmbralDeClasificacion[];
  ordenCategorias?: string[];
  // columnaClave (pendiente de M-03): opcional y ortogonal a criterioClasificacion
  // — si no viene, se conserva la que el dataset ya tuviera configurada.
  columnaClave?: string;
}

export interface ConfigurarCriterioDeClasificacionUseCase {
  // Lanza DatasetGenericoNoEncontradoError si el dataset no existe o es de
  // otro analista, ColumnaDeDatasetInvalidaError si nombreColumna/columnaClave
  // no están en dataset.columnas o si el tipo detectado no es apto (texto/fecha).
  ejecutar(datasetId: string, analistaId: string, input: ConfigurarCriterioDeClasificacionInput): Promise<DatasetGenerico>;
}
