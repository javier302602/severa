export class CvssFueraDeRangoError extends Error {
  constructor(message = 'El CVSS Score está fuera del rango permitido (0.0-10.0)') {
    super(message);
    this.name = 'CvssFueraDeRangoError';
  }
}
