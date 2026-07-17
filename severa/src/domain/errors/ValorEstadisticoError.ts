export class ValorEstadisticoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValorEstadisticoError';
  }
}
