import jwt from 'jsonwebtoken';
import { Analista } from '../../domain/entities/Analista';
import { AnalistaRepository } from '../ports/out/AnalistaRepository';
import { HasherDeContrasenas } from '../ports/out/HasherDeContrasenas';
import { CredencialesInvalidasError } from '../../domain/errors/CredencialesInvalidasError';
import { CuentaBloqueadaError } from '../../domain/errors/CuentaBloqueadaError';

export class IniciarSesion {
  constructor(
    private readonly analistaRepository: AnalistaRepository,
    private readonly hasher: HasherDeContrasenas,
    private readonly jwtSecret: string
  ) {}

  async ejecutar(input: { correo: string; contrasena: string }): Promise<{ analista: Analista; token: string }> {
    const analista = await this.analistaRepository.buscarPorCorreo(input.correo);
    if (!analista) {
      throw new CredencialesInvalidasError();
    }

    if (analista.bloqueado) {
      if (analista.bloqueoExpirado()) {
        analista.desbloquear();
        await this.analistaRepository.guardar(analista);
      } else {
        throw new CuentaBloqueadaError();
      }
    }

    const valido = await this.hasher.comparar(input.contrasena, analista.contrasenaHash);
    if (!valido) {
      analista.registrarIntentoFallido();
      await this.analistaRepository.guardar(analista);
      throw new CredencialesInvalidasError();
    }

    analista.registrarIntentoExitoso();
    await this.analistaRepository.guardar(analista);

    const token = jwt.sign({ sub: analista.id, rol: analista.rol }, this.jwtSecret, {
      expiresIn: '2h'
    });

    return { analista, token };
  }
}
