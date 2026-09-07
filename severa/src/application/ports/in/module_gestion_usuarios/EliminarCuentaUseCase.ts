export interface EliminarCuentaUseCase {
  ejecutar(id: string, contrasena: string): Promise<void>;
}
