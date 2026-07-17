export class FiltroVacioError extends Error {
  constructor(message = 'Debe especificar al menos un criterio de búsqueda') {
    super(message);
    this.name = 'FiltroVacioError';
  }
}
