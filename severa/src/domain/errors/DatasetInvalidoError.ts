export class DatasetInvalidoError extends Error {
  constructor(message = 'Dataset inválido') {
    super(message);
    this.name = 'DatasetInvalidoError';
  }
}
