import { randomUUID } from 'crypto';
import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { Notificacion } from '../../../../domain/entities/Notificacion';
import { ServicioDeNotificaciones } from '../../../../application/ports/out/ServicioDeNotificaciones';
import { NotificacionRepository } from '../../../../application/ports/out/NotificacionRepository';

// Stub de Sprint 09 (RF-76), ampliado en Sprint 13 (RF-99 a RF-102): el envío
// real (correo/Slack/etc.) sigue pendiente, pero ahora además de escribir en
// consola persiste cada evento en NotificacionRepository, para que aparezca
// en el centro de notificaciones del destinatario (GET /notificaciones).
export class ConsolaServicioDeNotificaciones implements ServicioDeNotificaciones {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  async notificarPlazoExcedido(vulnerabilidad: Vulnerabilidad, analistaId?: string): Promise<void> {
    const mensaje =
      `Plazo de remediación excedido: ${vulnerabilidad.cve.valor} ` +
      `(CVSS ${vulnerabilidad.cvssScore.valor}, estado ${vulnerabilidad.estadoRemediacion.valor})`;
    console.log(`[ALERTA RF-76] ${mensaje}`);

    // RF-76 (Sprint 14): antes esta alerta era solo consola porque
    // GenerarRankingUrgencia no conocía ningún analistaId — ahora
    // PriorizacionController lo pasa siempre; se mantiene opcional por si
    // algún caller futuro (o un test) invoca el ranking sin un analista
    // asociado.
    if (analistaId) {
      await this.notificacionRepository.guardar(
        new Notificacion(randomUUID(), 'PlazoVencido', analistaId, false, new Date(), mensaje)
      );
    }
  }

  async notificarVulnerabilidadCritica(vulnerabilidad: Vulnerabilidad, analistaId: string): Promise<void> {
    const mensaje = `Vulnerabilidad crítica detectada: ${vulnerabilidad.cve.valor} (CVSS ${vulnerabilidad.cvssScore.valor})`;
    console.log(`[ALERTA RF-99] ${mensaje}`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'VulnerabilidadCritica', analistaId, false, new Date(), mensaje)
    );
  }

  async notificarInformeListo(analistaId: string, formato: 'pdf' | 'docx'): Promise<void> {
    const mensaje = `Informe generado (${formato})`;
    console.log(`[RF-101] ${mensaje} para el analista ${analistaId}`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'InformeListo', analistaId, false, new Date(), mensaje)
    );
  }

  async notificarActualizacionDisponible(
    analistaId: string,
    resumen: { importados: number; rechazados: number }
  ): Promise<void> {
    const mensaje = `Sincronización con NVD completada: ${resumen.importados} importados, ${resumen.rechazados} rechazados`;
    console.log(`[RF-102] ${mensaje}`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'ActualizacionNVD', analistaId, false, new Date(), mensaje)
    );
  }
}
