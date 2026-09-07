import { Contrasena } from '../../../domain/shared/value-objects/Contrasena';
import { TokenRecuperacionInvalidoError } from '../../../domain/errors/TokenRecuperacionInvalidoError';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { TokenRecuperacionRepository } from '../../ports/out/persistencia/repositorios/TokenRecuperacionRepository';
import { HasherDeContrasenas } from '../../ports/out/seguridad/HasherDeContrasenas';
import { RestablecerContrasenaUseCase } from '../../ports/in/module_gestion_usuarios/RestablecerContrasenaUseCase';
import { hashearToken } from '../../utils/HashearToken';

export class RestablecerContrasena implements RestablecerContrasenaUseCase {
  constructor(
    private readonly analistaRepository: AnalistaRepository,
    private readonly tokenRepository: TokenRecuperacionRepository,
    private readonly hasher: HasherDeContrasenas
  ) {}

  async ejecutar(input: { token: string; nuevaContrasena: string }): Promise<{ analistaId: string }> {
    const nuevaContrasena = new Contrasena(input.nuevaContrasena);

    const tokenRecuperacion = await this.tokenRepository.buscarPorHash(hashearToken(input.token));
    if (!tokenRecuperacion || tokenRecuperacion.usado || tokenRecuperacion.expirado()) {
      throw new TokenRecuperacionInvalidoError();
    }

    const analista = await this.analistaRepository.buscarPorId(tokenRecuperacion.analistaId);
    if (!analista) {
      throw new TokenRecuperacionInvalidoError();
    }

    analista.contrasenaHash = await this.hasher.generarHash(nuevaContrasena.valor);
    await this.analistaRepository.guardar(analista);

    tokenRecuperacion.marcarComoUsado();
    await this.tokenRepository.guardar(tokenRecuperacion);

    return { analistaId: analista.id };
  }
}
