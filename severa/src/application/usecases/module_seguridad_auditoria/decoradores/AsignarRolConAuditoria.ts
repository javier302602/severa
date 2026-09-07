import { Analista, RolAnalista } from '../../../../domain/entities/Analista';
import { AsignarRolUseCase } from '../../../ports/in/module_gestion_usuarios/AsignarRolUseCase';
import { AnalistaRepository } from '../../../ports/out/persistencia/repositorios/AnalistaRepository';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';

// RF-04 + RNF-33: registra quién asignó qué rol a quién, y cuál era el rol
// anterior. No implementa AsignarRolUseCase (mismo criterio que
// MarcarEnProcesoDeRemediacionConAuditoria): necesita el id del administrador
// que ejecuta la acción, un dato que la interfaz base no tiene porque
// AsignarRol no lo necesita para su propia lógica. Lee el rol anterior con su
// propia consulta ANTES de delegar, porque AsignarRol muta el mismo objeto
// Analista que devuelve — para cuando el decorador recibe el resultado, el
// rol viejo ya se perdió.
export class AsignarRolConAuditoria {
  constructor(
    private readonly usecase: AsignarRolUseCase,
    private readonly analistaRepository: AnalistaRepository,
    private readonly auditoriaRepository: AuditoriaRepository
  ) {}

  async ejecutar(input: { analistaId: string; nuevoRol: RolAnalista }, asignadoPor: string): Promise<Analista> {
    const analistaAntes = await this.analistaRepository.buscarPorId(input.analistaId);
    const rolAnterior = analistaAntes?.rol ?? 'desconocido';

    const analista = await this.usecase.ejecutar(input);

    await this.auditoriaRepository.registrar({
      usuario: asignadoPor,
      accion: 'AsignacionDeRol',
      detalle: `Rol de ${analista.correo.valor} (${analista.id}) cambiado de '${rolAnterior}' a '${analista.rol}'`
    });

    return analista;
  }
}
