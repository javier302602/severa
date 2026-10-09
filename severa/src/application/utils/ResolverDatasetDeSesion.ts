import { DatosDataset, SesionAnalisisStore } from '../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoRepository } from '../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../domain/entities/DatasetGenerico';
import { SesionAnalisisNoEncontradaError } from '../../domain/errors/SesionAnalisisNoEncontradaError';
import { SesionSinDatasetError } from '../../domain/errors/SesionSinDatasetError';
import { DatasetGenericoNoEncontradoError } from '../../domain/errors/DatasetGenericoNoEncontradoError';

export function obtenerSesion(sesionAnalisisStore: SesionAnalisisStore, analistaId: string, sesionId: string): DatosDataset {
  const datos = sesionAnalisisStore.obtener(analistaId, sesionId);
  if (!datos) {
    throw new SesionAnalisisNoEncontradaError();
  }
  return datos;
}

// Los casos de uso de M-14/M-15 Ronda 2 trabajan sobre las filas de la sesión
// (en memoria) y dejan constancia en el dataset persistido del que salieron.
// Este es el único lugar que resuelve ese par, siempre con el analistaId del
// token en las dos búsquedas.
export async function obtenerSesionConDataset(
  sesionAnalisisStore: SesionAnalisisStore,
  datasetGenericoRepository: DatasetGenericoRepository,
  analistaId: string,
  sesionId: string
): Promise<{ datos: DatosDataset; dataset: DatasetGenerico }> {
  const datos = obtenerSesion(sesionAnalisisStore, analistaId, sesionId);
  if (!datos.datasetId) {
    throw new SesionSinDatasetError();
  }
  const dataset = await datasetGenericoRepository.buscarPorId(datos.datasetId, analistaId);
  if (!dataset) {
    throw new DatasetGenericoNoEncontradoError();
  }
  return { datos, dataset };
}
