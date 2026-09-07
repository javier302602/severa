import { randomBytes, randomUUID } from 'crypto';
import { TokenRecuperacion } from '../../../domain/entities/TokenRecuperacion';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { TokenRecuperacionRepository } from '../../ports/out/persistencia/repositorios/TokenRecuperacionRepository';
import { EnviadorDeCorreo } from '../../ports/out/notificaciones/EnviadorDeCorreo';
import { RecuperarContrasenaUseCase } from '../../ports/in/module_gestion_usuarios/RecuperarContrasenaUseCase';
import { hashearToken } from '../../utils/HashearToken';

const DURACION_TOKEN_MS = 30 * 60 * 1000;

export class RecuperarContrasena implements RecuperarContrasenaUseCase {
  constructor(
    private readonly analistaRepository: AnalistaRepository,
    private readonly tokenRepository: TokenRecuperacionRepository,
    private readonly enviadorDeCorreo: EnviadorDeCorreo
  ) {}

  async ejecutar(input: { correo: string }): Promise<{ analistaId: string } | null> {
    const analista = await this.analistaRepository.buscarPorCorreo(input.correo);
    if (!analista) {
      // Anti-enumeración: no revela si el correo existe.
      return null;
    }

    // RNF-31: nunca más de un token vigente a la vez.
    await this.tokenRepository.invalidarVigentesDeAnalista(analista.id);

    const tokenPlano = randomBytes(32).toString('hex');
    const expiraEn = new Date(Date.now() + DURACION_TOKEN_MS);
    await this.tokenRepository.guardar(
      new TokenRecuperacion(randomUUID(), analista.id, hashearToken(tokenPlano), expiraEn)
    );

    await this.enviadorDeCorreo.enviarEnlaceDeRecuperacion(analista.correo.valor, tokenPlano);

    return { analistaId: analista.id };
  }
}
