import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { EntradaRanking } from '../../../domain/services/MotorDePriorizacion';

export interface GenerarRankingUrgenciaUseCase {
  // analistaId ahora cumple doble función: (1) aísla el ranking al catálogo
  // del analista que lo pide (multi-tenancy), y (2) sigue siendo, como antes
  // de la multi-tenancy (RF-76, Sprint 14), el destinatario de las alertas
  // de plazo excedido que dispare esta llamada. Antes era opcional (podía
  // invocarse sin analista asociado); ahora es obligatorio porque sin
  // aislamiento no hay forma segura de listar "todas las vulnerabilidades".
  // severidad (2026-07-19, "carga por etapas"): opcional — si viene, el
  // ranking se genera SOLO sobre esa severidad (reutiliza
  // VulnerabilidadRepository.filtrarPorSeveridad, ya usado por
  // FiltrarPorSeveridad/BuscarConFiltros, no un mecanismo nuevo), en vez de
  // traer TODO el catálogo del analista de una sola vez.
  ejecutar(analistaId: string, vulnerabilidades?: Vulnerabilidad[], severidad?: string): Promise<EntradaRanking[]>;
}
