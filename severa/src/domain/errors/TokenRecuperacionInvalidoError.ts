// Un solo error genérico para token inexistente, expirado o ya usado — mismo
// criterio anti-enumeración que CredencialesInvalidasError (no distingue "no
// existe" de "contraseña incorrecta"): no revela cuál de los tres casos aplicó.
export class TokenRecuperacionInvalidoError extends Error {
  constructor(message = 'El token de recuperación no es válido o ya expiró') {
    super(message);
    this.name = 'TokenRecuperacionInvalidoError';
  }
}
