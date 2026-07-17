export class EstructuraColumnasInvalidaError extends Error {
  constructor(message = 'La estructura de columnas del dataset es inválida') {
    super(message);
    this.name = 'EstructuraColumnasInvalidaError';
  }
}
