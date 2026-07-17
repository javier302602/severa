import { RegistroAuditoria } from '../../domain/entities/RegistroAuditoria';
import { ConsultarAuditoriaUseCase } from '../ports/in/ConsultarAuditoriaUseCase';
import { AuditoriaRepository } from '../ports/out/AuditoriaRepository';

export class ConsultarAuditoria implements ConsultarAuditoriaUseCase {
  constructor(private readonly auditoriaRepository: AuditoriaRepository) {}

  async ejecutar(): Promise<RegistroAuditoria[]> {
    return this.auditoriaRepository.listar();
  }
}
