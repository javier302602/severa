import { RegistroAuditoria } from '../../../../domain/entities/RegistroAuditoria';
import { FiltroDeAuditoria } from '../../out/persistencia/repositorios/AuditoriaRepository';

export interface ConsultarAuditoriaUseCase {
  // RF-138: con `datasetId`, solo la auditoría de ese dataset genérico.
  ejecutar(filtro?: FiltroDeAuditoria): Promise<RegistroAuditoria[]>;
}
