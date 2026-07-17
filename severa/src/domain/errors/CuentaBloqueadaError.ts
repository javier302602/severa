export class CuentaBloqueadaError extends Error {
  constructor(message = 'La cuenta está bloqueada') {
    super(message);
    this.name = 'CuentaBloqueadaError';
  }
}
