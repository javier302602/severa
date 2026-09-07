import { Analista } from '../../../../domain/entities/Analista';
import { IniciarSesionUseCase } from '../../../ports/in/module_gestion_usuarios/IniciarSesionUseCase';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';

// RF-08/RF-94/95: registra TODO inicio de sesión, exitoso o fallido, con IP
// (RF-08 lo exige explícitamente: "fecha, hora e IP de cada inicio de
// sesión"). No implementa IniciarSesionUseCase (mismo criterio que
// AsignarRolConAuditoria): necesita la IP de origen, un dato que la interfaz
// base no tiene porque IniciarSesion no la necesita para su propia lógica —
// la resuelve el controller HTTP y se la pasa explícita, nunca Express
// dentro de este decorador.
//
// Para un login fallido, `usuario` es el correo INTENTADO, no un id
// resuelto: CredencialesInvalidasError cubre tanto "no existe" como
// "contraseña incorrecta" (anti-enumeración), así que no siempre hay una
// cuenta real a la cual atribuir el intento.
export class IniciarSesionConAuditoria {
  constructor(
    private readonly iniciarSesion: IniciarSesionUseCase,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(
    input: { correo: string; contrasena: string },
    ip: string | null = null
  ): Promise<{ analista: Analista; token: string }> {
    try {
      const resultado = await this.iniciarSesion.ejecutar(input);

      await this.auditoriaRepository.registrar({
        usuario: resultado.analista.id,
        accion: 'Login',
        detalle: `Inicio de sesión de ${resultado.analista.correo.valor}`,
        ip
      });

      return resultado;
    } catch (error) {
      await this.auditoriaRepository.registrar({
        usuario: input.correo,
        accion: 'LoginFallido',
        detalle: `Intento de inicio de sesión fallido para ${input.correo}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
        ip
      });

      throw error;
    }
  }
}
