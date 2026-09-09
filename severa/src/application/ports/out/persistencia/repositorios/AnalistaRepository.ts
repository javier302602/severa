import { Analista } from '../../../../../domain/entities/Analista';
import { VariableNumericaVulnerabilidad } from '../../../../../domain/services/classification/VariablesVulnerabilidad';

export interface UmbralCriticoPersistido {
  variable: VariableNumericaVulnerabilidad;
  valor: number;
}

export interface AnalistaRepository {
  guardar(analista: Analista): Promise<void>;
  buscarPorCorreo(correo: string): Promise<Analista | null>;
  buscarPorId(id: string): Promise<Analista | null>;
  eliminar(id: string): Promise<void>;
  // RF-99 (M-13, retoma): UPDATE acotado a estas dos columnas — mismo
  // criterio que DatasetGenericoRepository.actualizarCriterioClasificacion
  // (M-09), no un guardar() genérico que reescriba todo el analista.
  actualizarUmbralCritico(analistaId: string, variable: VariableNumericaVulnerabilidad, valor: number): Promise<void>;
  // null cuando el analista no configuró nada (columnas NULL) — el llamador
  // resuelve el default (cvssScore, 9.0) en DetectorDeEventosNotificables.ts,
  // no acá.
  obtenerUmbralCritico(analistaId: string): Promise<UmbralCriticoPersistido | null>;
  // RF-100 (M-13, retoma): único consumidor es el cron de plazos próximos a
  // vencer (NotificarPlazosProximosAVencer) — necesita recorrer TODOS los
  // analistas, no uno puntual. Sin filtrar por `bloqueado`: ese flag es de
  // seguridad de login, no de elegibilidad para notificaciones (ver
  // auditoría de retoma M-13, decisión confirmada).
  listarTodos(): Promise<Analista[]>;
}
