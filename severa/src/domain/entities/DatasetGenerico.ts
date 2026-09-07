// Generalización de M-03 (RF-17/18/21/23, flujo persistido): a diferencia de
// Vulnerabilidad, no asume ninguna columna fija — `columnas` es la lista de
// nombres tal como vinieron en el archivo, y cada registro real vive aparte
// en RegistroDatasetGenerico. `preset` queda reservado para cuando el
// analista active el preset de ciberseguridad (Anexo D del SDS) sobre este
// mismo pipeline; por ahora siempre es null (nadie lo escribe todavía).
export class DatasetGenerico {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly nombreArchivo: string,
    public readonly columnas: string[],
    public readonly fuente: string,
    public readonly preset: string | null,
    public readonly filasDuplicadas: number,
    public readonly fechaCarga: Date = new Date()
  ) {}
}
