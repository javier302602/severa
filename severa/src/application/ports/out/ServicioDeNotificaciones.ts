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
  // Ya no se dispara una vez por fila crítica (bug real reportado: importar
  // un dataset con muchas críticas inundaba el centro de notificaciones con
  // decenas de alertas idénticas en su forma) — se mantiene el método por si
  // algún caller puntual necesita UNA alerta aislada, pero el camino de
  // importación masiva usa notificarImportacionCompletada en su lugar (ver
  // ImportarDatasetConAuditoria.ejecutar/registrarImportacionPorLink).
  notificarVulnerabilidadCritica(vulnerabilidad: Vulnerabilidad, analistaId: string): Promise<void>;
  // Resumen único por importación (2026-07-19, bug real: "1 upload dataset
  // -> 10+ notificaciones" — un dataset con N vulnerabilidades críticas
  // disparaba N notificarVulnerabilidadCritica seguidas). Reemplaza esas N
  // llamadas por UNA sola al terminar la importación completa (archivo,
  // link o streaming), con el conteo de críticas incluido en el mensaje.
  notificarImportacionCompletada(
    analistaId: string,
    resumen: { importados: number; rechazados: number; criticas: number }
  ): Promise<void>;
  // RF-101: informe recién generado.
  notificarInformeListo(analistaId: string, formato: 'pdf' | 'docx'): Promise<void>;
  // RF-102: sincronización con la API NVD completada.
  notificarActualizacionDisponible(
    analistaId: string,
    resumen: { importados: number; rechazados: number }
  ): Promise<void>;
}
