import { DatasetGenerico } from '../../../../../domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../../../domain/entities/RegistroDatasetGenerico';
import { CriterioDeClasificacionValue } from '../../../../../domain/shared/value-objects/CriterioDeClasificacion';

// Multi-tenancy a nivel de dueño (mismo criterio que VulnerabilidadRepository):
// buscarPorId/listarRegistros SIEMPRE reciben analistaId y filtran por él en
// el SQL — un id de otro analista se trata igual que uno inexistente, nunca
// se distingue (ver DatasetGenericoNoEncontradoError).
export interface DatasetGenericoRepository {
  guardar(dataset: DatasetGenerico): Promise<void>;
  // Un solo INSERT multi-VALUES por llamada (mismo contrato que
  // VulnerabilidadRepository.guardarLote) — el llamador decide el tamaño del
  // lote (ver AnalizarDatasetGenerico.ts).
  guardarRegistros(registros: RegistroDatasetGenerico[]): Promise<void>;
  buscarPorId(id: string, analistaId: string): Promise<DatasetGenerico | null>;
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
}
