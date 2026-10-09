// RF-28 / RF-69: la escala de clasificación que mandó el analista no se puede
// usar (cortes desordenados, fuera de rango o con más de un decimal). El
// mensaje está escrito para el analista.
export class EscalaDeClasificacionInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalaDeClasificacionInvalidaError';
  }
}
