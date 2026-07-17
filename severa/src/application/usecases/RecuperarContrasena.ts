import { AnalistaRepository } from '../ports/out/AnalistaRepository';

export class RecuperarContrasena {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(input: { correo: string }): Promise<void> {
    const analista = await this.analistaRepository.buscarPorCorreo(input.correo);
    if (!analista) {
      return;
    }

    // Nota: aquí se enviaría un enlace de recuperación mediante un adaptador de notificación.
  }
}
