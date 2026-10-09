// Un registro real de un DatasetGenerico. `valores` es la fila cruda tal
// cual (Record<string, unknown>, mismo criterio que DatosDataset en
// SesionAnalisisStore) — no hay columnas fijas que mapear.
export class RegistroDatasetGenerico {
  constructor(
    public readonly id: string,
    public readonly datasetId: string,
    public readonly analistaId: string,
    public readonly valores: Record<string, unknown>,
    public readonly fechaCarga: Date = new Date(),
    // Posición de la fila en el archivo (0 = primera). null en registros
    // guardados antes de la migración 016, que no la registraban.
    public readonly posicion: number | null = null
  ) {}
}
