import { TransicionDeEstadoInvalidaError } from '../errors/TransicionDeEstadoInvalidaError';

export type EstadoRemediacion = 'Pendiente' | 'EnProceso' | 'Remediada';

// RF-74/RF-75: flujo lineal sin saltos. Una vulnerabilidad no puede pasar de
// Pendiente a Remediada sin pasar antes por EnProceso (decisión confirmada
// con el product owner; el SDS no fija esta regla de transición de forma
// explícita, solo los dos cambios de estado por separado).
const TRANSICIONES_VALIDAS: Record<EstadoRemediacion, EstadoRemediacion[]> = {
  Pendiente: ['EnProceso'],
  EnProceso: ['Remediada'],
  Remediada: []
};

export class EstadoRemediacionValue {
  public readonly valor: EstadoRemediacion;

  constructor(valor: EstadoRemediacion = 'Pendiente') {
    this.valor = valor;
  }

  transicionarA(nuevoEstado: EstadoRemediacion): EstadoRemediacionValue {
    if (!TRANSICIONES_VALIDAS[this.valor].includes(nuevoEstado)) {
      throw new TransicionDeEstadoInvalidaError(this.valor, nuevoEstado);
    }
    return new EstadoRemediacionValue(nuevoEstado);
  }
}
