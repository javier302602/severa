// RF-120/121 (M-15): una decisión de tratamiento de valores faltantes que no
// se puede aplicar (columna inexistente, método que no corresponde al tipo de
// la variable, una limpieza que dejaría el dataset vacío…). Es un error de lo
// que pidió el analista: la capa HTTP lo responde como 400 con el mensaje.
export class TratamientoDeFaltantesInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TratamientoDeFaltantesInvalidoError';
  }
}
