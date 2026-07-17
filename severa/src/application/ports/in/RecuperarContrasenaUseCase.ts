export interface RecuperarContrasenaUseCase {
  ejecutar(input: { correo: string }): Promise<void>;
}
