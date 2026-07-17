export class UrlNoPermitidaError extends Error {
  constructor(message = 'URL no permitida') {
    super(message);
    this.name = 'UrlNoPermitidaError';
  }
}
