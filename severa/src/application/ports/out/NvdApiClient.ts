export interface NvdApiClient {
  descargarDataset(): Promise<Buffer>;
}
