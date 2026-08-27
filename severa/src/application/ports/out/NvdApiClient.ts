import { FilaImportable, FilaRechazada } from '../../../infrastructure/adapters/out/dataset/LectorExcelDataset';

export interface NvdApiClient {
  // url: la URL EXACTA que ya pasó la allowlist de DetectorDeTipoDeLink —
  // nunca se reconstruye internamente con un host/params propios (ver
  // ParseadorRespuestaNvd.ts para el porqué).
  descargarDataset(url: string): Promise<{ importables: FilaImportable[]; rechazadas: FilaRechazada[] }>;
}
