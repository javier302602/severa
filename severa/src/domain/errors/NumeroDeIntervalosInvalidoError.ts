export class NumeroDeIntervalosInvalidoError extends Error {
  constructor(message = 'Número de intervalos inválido') {
    super(message);
    this.name = 'NumeroDeIntervalosInvalidoError';
  }
}
