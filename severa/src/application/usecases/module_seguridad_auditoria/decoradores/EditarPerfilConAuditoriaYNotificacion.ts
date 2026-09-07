import { Analista } from '../../../../domain/entities/Analista';
import { EditarPerfilUseCase } from '../../../ports/in/module_perfil_analista/EditarPerfilUseCase';
import { AnalistaRepository } from '../../../ports/out/persistencia/repositorios/AnalistaRepository';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../ports/out/notificaciones/ServicioDeNotificaciones';

// RF-10/RNF-41 + RF-16: cierra en un solo decorador el gap de auditoría de
// EditarPerfil (antes "pelado" en container.ts) y la notificación de cambios
// de perfil — mismo criterio que GenerarInformeConAuditoria/
// GenerarResumenEjecutivoConAuditoria (auditar y notificar en la misma clase
// cuando ambas cosas aplican al mismo caso de uso, en vez de encadenar dos
// decoradores). Lee el analista con su propia consulta ANTES de delegar:
// EditarPerfil.actualizarPerfil() muta en el sitio la MISMA instancia que
// devuelve, así que si no se lee antes, los valores viejos ya se perdieron
// para cuando el decorador recibe el resultado (mismo motivo que
// AsignarRolConAuditoria/EliminarCuentaConAuditoria).
//
// El detalle de auditoría y el mensaje de notificación solo dicen QUÉ campo
// cambió ('nombre'/'correo'), nunca el valor viejo ni el nuevo, y nunca la
// contraseña (que este caso de uso ni siquiera toca). Si ningún campo
// cambió de verdad (el analista reenvía su propio nombre/correo sin
// modificarlos — caso borde ya cubierto por EditarPerfil/RF-10), no se
// audita ni se notifica nada.
export class EditarPerfilConAuditoriaYNotificacion implements EditarPerfilUseCase {
  constructor(
    private readonly usecase: EditarPerfilUseCase,
    private readonly analistaRepository: AnalistaRepository,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  async ejecutar(input: { id: string; nombre: string; correo: string }): Promise<Analista> {
    const antes = await this.analistaRepository.buscarPorId(input.id);

    const despues = await this.usecase.ejecutar(input);

    const camposModificados: string[] = [];
    if (antes && antes.nombre !== despues.nombre) {
      camposModificados.push('nombre');
    }
    if (antes && antes.correo.valor !== despues.correo.valor) {
      camposModificados.push('correo');
    }

    if (camposModificados.length > 0) {
      await this.auditoriaRepository.registrar({
        usuario: despues.id,
        accion: 'EdicionDePerfil',
        detalle: `Perfil editado: se modificó ${camposModificados.join(' y ')}`
      });

      await this.servicioDeNotificaciones.notificarPerfilActualizado(despues.id, camposModificados);
    }

    return despues;
  }
}
