// Mismo criterio IDOR que SesionAnalisisNoEncontradaError: un datasetId
// inexistente y uno que existe pero pertenece a otro analista se tratan
// exactamente igual (404 genérico), para no revelar si el id existe.
export class DatasetGenericoNoEncontradoError extends Error {
  constructor(message = 'Dataset no encontrado') {
    super(message);
    this.name = 'DatasetGenericoNoEncontradoError';
  }
}
