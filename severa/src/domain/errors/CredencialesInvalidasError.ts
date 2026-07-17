export class CredencialesInvalidasError extends Error {
  constructor(message = 'Credenciales inválidas') {
    super(message);
    this.name = 'CredencialesInvalidasError';
  }
}
