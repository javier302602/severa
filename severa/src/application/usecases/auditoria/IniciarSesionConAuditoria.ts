import { Analista } from '../../../domain/entities/Analista';
import { IniciarSesionUseCase } from '../../ports/in/IniciarSesionUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';

// RF-94/95: único punto donde se registra un login exitoso. Decora
// IniciarSesion sin tocar su lógica de negocio; solo se audita si el login
// tuvo éxito (si lanza CredencialesInvalidasError/CuentaBloqueadaError, no
// llega a registrarse nada, que es la intención: auditamos accesos reales,
// no intentos fallidos).
export class IniciarSesionConAuditoria implements IniciarSesionUseCase {
  constructor(
    private readonly iniciarSesion: IniciarSesionUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(input: { correo: string; contrasena: string }): Promise<{ analista: Analista; token: string }> {
    const resultado = await this.iniciarSesion.ejecutar(input);

    await this.auditoriaRepository.registrar({
      usuario: resultado.analista.id,
      accion: 'Login',
      detalle: `Inicio de sesión de ${resultado.analista.correo.valor}`
    });

    return resultado;
  }
}
