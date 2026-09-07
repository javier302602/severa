export interface RestablecerContrasenaUseCase {
  ejecutar(input: { token: string; nuevaContrasena: string }): Promise<{ analistaId: string }>;
}
