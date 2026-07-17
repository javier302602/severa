import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

// RF-76 (Sprint 09) + RF-99 a RF-102 (Sprint 13): único puerto de salida para
// "algo notificable ocurrió". Cada método es responsable de avisar (hoy,
// consola) Y de dejar constancia en el centro de notificaciones del
// destinatario (tabla `notificaciones`) — un solo punto de emisión, igual que
// se centralizó la auditoría en Sprint 12, en vez de que cada caso de uso
// llame por separado a este puerto y a NotificacionRepository.
//
export interface ServicioDeNotificaciones {
  // RF-76: analistaId es opcional porque GenerarRankingUrgencia puede
  // invocarse con la lista de vulnerabilidades directamente (en tests, o
  // desde cualquier caller futuro que no tenga un analista asociado) — cuando
  // no se provee, la alerta sigue siendo solo consola, igual que antes de
  // Sprint 14; cuando sí, además queda en el centro de notificaciones del
  // destinatario (PriorizacionController ya lo pasa siempre).
  notificarPlazoExcedido(vulnerabilidad: Vulnerabilidad, analistaId?: string): Promise<void>;
  // RF-99: alerta de vulnerabilidad crítica (CVSS >= 9.0) recién importada.
  notificarVulnerabilidadCritica(vulnerabilidad: Vulnerabilidad, analistaId: string): Promise<void>;
  // RF-101: informe recién generado.
  notificarInformeListo(analistaId: string, formato: 'pdf' | 'docx'): Promise<void>;
  // RF-102: sincronización con la API NVD completada.
  notificarActualizacionDisponible(
    analistaId: string,
    resumen: { importados: number; rechazados: number }
  ): Promise<void>;
}
