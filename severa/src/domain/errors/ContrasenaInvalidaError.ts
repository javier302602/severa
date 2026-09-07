export class ContrasenaInvalidaError extends Error {
  constructor(message = 'La contraseña debe tener al menos 8 caracteres') {
    super(message);
    this.name = 'ContrasenaInvalidaError';
  }
}
