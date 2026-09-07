// Un registro real de un DatasetGenerico. `valores` es la fila cruda tal
// cual (Record<string, unknown>, mismo criterio que DatosDataset en
// SesionAnalisisStore) — no hay columnas fijas que mapear.
export class RegistroDatasetGenerico {
  constructor(
    public readonly id: string,
    public readonly datasetId: string,
    public readonly analistaId: string,
    public readonly valores: Record<string, unknown>,
    public readonly fechaCarga: Date = new Date()
  ) {}
}
