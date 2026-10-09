// RF-123 (M-15): una operación registrada en la bitácora de trazabilidad de
// un dataset. Los campos son los que enumera el criterio de aceptación —
// fecha, usuario, operación, variable, cantidad de registros y método — más
// de qué versión partió y cuál generó.
export type OperacionDeBitacora =
  // RF-120/121: tratamiento de valores faltantes.
  | 'eliminar_registros'
  | 'eliminar_columna'
  | 'imputar'
  // RF-111: el analista cambió el tipo de una variable (o volvió al detectado).
  | 'corregir_tipo'
  // RF-110: el analista confirmó, cambió o rechazó la variable objetivo.
  | 'definir_variable_objetivo';

export class EntradaDeBitacoraDeDataset {
  constructor(
    public readonly id: string,
    public readonly datasetOriginalId: string,
    public readonly analistaId: string,
    public readonly fecha: Date,
    public readonly secuencia: number,
    public readonly operacion: OperacionDeBitacora,
    // null cuando la operación no es sobre una variable en particular.
    public readonly variable: string | null,
    public readonly registrosAfectados: number,
    // Texto legible: "mediana", "moda", "eliminación de filas con faltantes",
    // "manual"...
    public readonly metodo: string,
    public readonly versionOrigen: number,
    // null si la operación no generó una versión nueva del dataset.
    public readonly versionResultado: number | null,
    // Datos propios de cada operación (valor imputado, tipo anterior y nuevo…).
    public readonly detalle: Record<string, unknown> = {},
    // Nombre del analista al momento de consultar; lo completa el repositorio.
    public readonly nombreAnalista: string | null = null
  ) {}
}
