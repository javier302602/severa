import { RegistroAuditoria } from '../../../../../domain/entities/RegistroAuditoria';

export interface FiltroDeAuditoria {
  // RF-138: solo los registros de un dataset genérico. Se puede pasar el id
  // del original o el de cualquiera de sus versiones.
  datasetId?: string;
}

export interface AuditoriaRepository {
  // RF-08: `ip` es opcional para no romper a los llamadores que no la tienen
  // (RF-03, RF-04 y el resto de decoradores de auditoría del sistema).
  // RF-138: `datasetId` (el id del original) cuando la operación es sobre un
  // dataset genérico.
  registrar(input: { usuario: string; accion: string; detalle: string; ip?: string | null; datasetId?: string | null }): Promise<void>;
  listar(filtro?: FiltroDeAuditoria): Promise<RegistroAuditoria[]>;
}
