import { ResumenImportacion } from './ImportarDatasetUseCase';

export interface SincronizarConApiNvdUseCase {
  // url: la URL real de NVD (ya validada contra la allowlist por
  // DetectorDeTipoDeLink) contra la que efectivamente se descarga — nunca se
  // reconstruye una propia internamente. Devuelve el mismo ResumenImportacion
  // que cualquier otro camino de importación (ver ImportarDataset.ts) — en
  // los hechos ya lo hacía (SincronizarConApiNvd delega en
  // ImportarDatasetConAuditoria), esto solo lo refleja en el tipo.
  ejecutar(analistaId: string, url: string): Promise<ResumenImportacion>;
}
