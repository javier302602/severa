import { RecuperarContrasenaUseCase } from '../../../ports/in/module_gestion_usuarios/RecuperarContrasenaUseCase';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';

// RF-03 + RNF-33: audita la solicitud de recuperación, pero solo cuando el
// correo corresponde a una cuenta real — si el caso base devuelve null
// (correo inexistente), no hay nada que auditar ni ningún usuario al cual
// atribuírselo (mismo criterio que IniciarSesionConAuditoria: solo se
// registran eventos reales, nunca intentos sobre cuentas que no existen).
export class RecuperarContrasenaConAuditoria implements RecuperarContrasenaUseCase {
  constructor(
    private readonly usecase: RecuperarContrasenaUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(input: { correo: string }): Promise<{ analistaId: string } | null> {
    const resultado = await this.usecase.ejecutar(input);

    if (resultado) {
      await this.auditoriaRepository.registrar({
        usuario: resultado.analistaId,
        accion: 'SolicitudRecuperacionContrasena',
        detalle: `Se generó un token de recuperación de contraseña para ${input.correo}`
      });
    }

    return resultado;
  }
}
