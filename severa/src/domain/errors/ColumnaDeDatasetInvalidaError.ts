// Cubre tanto el criterio de clasificación (RF-139) como la columna clave
// (pendiente de M-03) — ambos son "el analista referencia una columna de
// dataset.columnas que no sirve para el rol que le está asignando", mismo
// tipo de error, mensaje específico por caso.
export class ColumnaDeDatasetInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColumnaDeDatasetInvalidaError';
  }
}
