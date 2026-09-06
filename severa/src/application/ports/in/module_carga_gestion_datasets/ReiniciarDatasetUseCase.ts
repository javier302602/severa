export interface ResumenReinicioDataset {
  eliminados: number;
}

export interface ReiniciarDatasetUseCase {
  ejecutar(analistaId: string): Promise<ResumenReinicioDataset>;
}
