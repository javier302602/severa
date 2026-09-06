import { RegistroAuditoria } from '../../../domain/entities/RegistroAuditoria';
import { ConsultarAuditoriaUseCase } from '../../ports/in/module_seguridad_auditoria/ConsultarAuditoriaUseCase';
import { AuditoriaRepository } from '../../ports/out/persistencia/repositorios/AuditoriaRepository';

export class ConsultarAuditoria implements ConsultarAuditoriaUseCase {
  constructor(private readonly auditoriaRepository: AuditoriaRepository) {}

  async ejecutar(): Promise<RegistroAuditoria[]> {
    return this.auditoriaRepository.listar();
  }
}
