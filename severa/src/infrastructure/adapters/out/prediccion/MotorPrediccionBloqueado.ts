import { IMotorPrediccion } from '../../../../application/ports/out/prediccion/IMotorPrediccion';

// M-16 (Predicción y Modelado) — 🔒 BLOQUEADO. Implementación stub: no hay
// ningún caso de uso ni entrada en container.ts que la instancie todavía.
// Existe solo para que el puerto IMotorPrediccion tenga un adaptador de
// referencia en la arquitectura, sin implementar ninguna lógica de
// predicción real.
export class MotorPrediccionBloqueado implements IMotorPrediccion {
  async predecir(): Promise<never> {
    throw new Error(
      'Módulo M-16 bloqueado — pendiente de material académico, no implementar ni sugerir un método hasta recibirlo'
    );
  }
}
