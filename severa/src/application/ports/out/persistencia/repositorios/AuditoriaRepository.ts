import { RegistroAuditoria } from '../../../../../domain/entities/RegistroAuditoria';

export interface AuditoriaRepository {
  // RF-08: `ip` es opcional para no romper a los llamadores que no la tienen
  // (RF-03, RF-04 y el resto de decoradores de auditoría del sistema).
  registrar(input: { usuario: string; accion: string; detalle: string; ip?: string | null }): Promise<void>;
  listar(): Promise<RegistroAuditoria[]>;
}
