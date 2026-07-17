import { RegistroAuditoria } from '../../../domain/entities/RegistroAuditoria';

export interface AuditoriaRepository {
  registrar(input: { usuario: string; accion: string; detalle: string }): Promise<void>;
  listar(): Promise<RegistroAuditoria[]>;
}
