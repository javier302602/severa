// La sesión de análisis existe, pero no está asociada a un dataset guardado,
// así que no hay dónde persistir lo que se pidió (una corrección de tipo, una
// limpieza). No debería ocurrir con sesiones creadas por la carga normal de un
// archivo; cubre sesiones anteriores a M-14/M-15 Ronda 2 que sigan vivas en
// memoria durante una actualización.
export class SesionSinDatasetError extends Error {
  constructor(message = 'Esta sesión de análisis no está asociada a un dataset guardado. Volvé a cargar el archivo para continuar.') {
    super(message);
    this.name = 'SesionSinDatasetError';
  }
}
