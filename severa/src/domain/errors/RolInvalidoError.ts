export class RolInvalidoError extends Error {
  constructor(rolRecibido: string) {
    super(`El rol '${rolRecibido}' no es válido. Roles permitidos: analista, administrador`);
    this.name = 'RolInvalidoError';
  }
}
