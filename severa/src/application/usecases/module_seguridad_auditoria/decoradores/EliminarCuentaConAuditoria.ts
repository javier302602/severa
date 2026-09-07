import { EliminarCuentaUseCase } from '../../../ports/in/module_gestion_usuarios/EliminarCuentaUseCase';
import { AnalistaRepository } from '../../../ports/out/persistencia/repositorios/AnalistaRepository';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';

// RF-15 + RNF-41: registra la eliminación de una cuenta — acción irreversible,
// por eso queda auditada igual que cualquier otra operación relevante del
// sistema. Lee el analista (correo) con su propia consulta ANTES de delegar
// en el caso de uso, mismo criterio que AsignarRolConAuditoria: una vez que
// EliminarCuenta borra la fila, ya no hay forma de consultar sus datos. Si la
// contraseña es incorrecta, usecase.ejecutar lanza ANTES de llegar a
// auditoriaRepository.registrar — un intento fallido nunca queda auditado
// como si la cuenta se hubiera borrado.
export class EliminarCuentaConAuditoria implements EliminarCuentaUseCase {
  constructor(
    private readonly usecase: EliminarCuentaUseCase,
    private readonly analistaRepository: AnalistaRepository,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(id: string, contrasena: string): Promise<void> {
    const analistaAntes = await this.analistaRepository.buscarPorId(id);

    await this.usecase.ejecutar(id, contrasena);

    await this.auditoriaRepository.registrar({
      usuario: id,
      accion: 'EliminacionDeCuenta',
      detalle: `Cuenta eliminada: ${analistaAntes?.correo.valor ?? 'desconocido'} (${id})`
    });
  }
}
