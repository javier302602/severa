import { DatasetGenerico } from '../../../../../domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../../../domain/entities/RegistroDatasetGenerico';

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
}
