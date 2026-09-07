export interface RecuperarContrasenaUseCase {
  // RF-03: retorna null si el correo no corresponde a ninguna cuenta (nunca
  // un error) — el llamador (controller/decorador) no debe distinguir ese
  // caso del de éxito de cara al cliente HTTP, por anti-enumeración.
  ejecutar(input: { correo: string }): Promise<{ analistaId: string } | null>;
}
