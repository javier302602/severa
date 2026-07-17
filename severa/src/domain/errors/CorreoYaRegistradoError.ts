export class CorreoYaRegistradoError extends Error {
  constructor(message = 'Ya existe un analista registrado con ese correo') {
    super(message);
    this.name = 'CorreoYaRegistradoError';
  }
}
