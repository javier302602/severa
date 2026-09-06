export interface EliminarCuentaUseCase {
  ejecutar(id: string): Promise<void>;
}
