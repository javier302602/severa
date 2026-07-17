export class TransicionDeEstadoInvalidaError extends Error {
  constructor(desde: string, hacia: string) {
    super(`No se puede pasar de "${desde}" a "${hacia}". El flujo válido es Pendiente → EnProceso → Remediada.`);
    this.name = 'TransicionDeEstadoInvalidaError';
  }
}
