export class CorreoInvalidoError extends Error {
  constructor(message = 'Correo inválido') {
    super(message);
    this.name = 'CorreoInvalidoError';
  }
}
