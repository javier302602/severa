// M-16 (Predicción y Modelado) — 🔒 BLOQUEADO. El SDS v4.0 documenta este
// módulo como pendiente de material académico: no hay, todavía, un método o
// algoritmo de predicción definido ni aprobado para implementar. Esta
// interfaz existe únicamente para dejar reservado el puerto de salida en la
// arquitectura (sección III del doc de arquitectura), sin comprometer ninguna
// forma de entrada/salida real hasta que el material académico llegue.
//
// No implementar ni sugerir un método de predicción concreto a partir de
// esta interfaz — cuando el material académico esté disponible, esta
// interfaz (y su adaptador stub, MotorPrediccionBloqueado.ts) deben
// revisarse desde cero junto con quien la apruebe.
export interface IMotorPrediccion {
  predecir(datos: unknown): Promise<never>;
}
