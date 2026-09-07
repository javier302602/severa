import { RestablecerContrasenaUseCase } from '../../../ports/in/module_gestion_usuarios/RestablecerContrasenaUseCase';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';

// RF-03 + RNF-33: solo se audita si el restablecimiento tuvo éxito — si el
// caso base lanza TokenRecuperacionInvalidoError o ContrasenaInvalidaError,
// el error se propaga tal cual y no llega a registrarse nada (mismo criterio
// que IniciarSesionConAuditoria).
export class RestablecerContrasenaConAuditoria implements RestablecerContrasenaUseCase {
  constructor(
    private readonly usecase: RestablecerContrasenaUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(input: { token: string; nuevaContrasena: string }): Promise<{ analistaId: string }> {
    const resultado = await this.usecase.ejecutar(input);

    await this.auditoriaRepository.registrar({
      usuario: resultado.analistaId,
      accion: 'RestablecimientoContrasena',
      detalle: 'La contraseña fue restablecida mediante el flujo de recuperación (RF-03)'
    });

    return resultado;
  }
}
