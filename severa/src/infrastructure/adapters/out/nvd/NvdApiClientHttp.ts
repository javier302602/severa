import axios from 'axios';
import { NvdApiClient } from '../../../../application/ports/out/NvdApiClient';
import { config } from '../../../config/env';

export class NvdApiClientHttp implements NvdApiClient {
  async descargarDataset(): Promise<Buffer> {
    const response = await axios.get(config.nvdApiBaseUrl, {
      headers: {
        'apiKey': config.nvdApiKey
      },
      responseType: 'arraybuffer'
    });
    // axios response.data typing can be unknown for arraybuffer responses; cast to any
    return Buffer.from(response.data as any);
  }
}
