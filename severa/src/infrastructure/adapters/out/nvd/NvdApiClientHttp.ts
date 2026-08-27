import axios from 'axios';
import { NvdApiClient } from '../../../../application/ports/out/NvdApiClient';
import { config } from '../../../config/env';
import { parsearRespuestaNvd } from './ParseadorRespuestaNvd';
import { FilaImportable, FilaRechazada } from '../dataset/LectorExcelDataset';

// Bug real encontrado en vivo (2026-07-17): esta clase pedía SIEMPRE
// config.nvdApiBaseUrl con params fijos (resultsPerPage=20), ignorando por
// completo la URL real que el usuario pegó (incluidos pubStartDate/
// pubEndDate) — DetectorDeTipoDeLink ya la valida contra la allowlist, así
// que acá se usa esa URL exacta, tal cual, sin reconstruir nada.
export class NvdApiClientHttp implements NvdApiClient {
  async descargarDataset(url: string): Promise<{ importables: FilaImportable[]; rechazadas: FilaRechazada[] }> {
    const response = await axios.get(url, {
      headers: config.nvdApiKey ? { apiKey: config.nvdApiKey } : {}
    });

    return parsearRespuestaNvd(response.data);
  }
}
