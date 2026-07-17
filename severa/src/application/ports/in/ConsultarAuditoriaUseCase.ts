import { RegistroAuditoria } from '../../../domain/entities/RegistroAuditoria';

export interface ConsultarAuditoriaUseCase {
  ejecutar(): Promise<RegistroAuditoria[]>;
}
