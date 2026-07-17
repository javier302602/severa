export class DatasetNVD {
  constructor(
    public readonly id: string,
    public readonly nombreArchivo: string,
    public readonly fechaCarga: Date,
    public readonly registros: number
  ) {}
}
