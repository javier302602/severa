import { randomUUID } from 'crypto';
import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { Notificacion } from '../../../../domain/entities/Notificacion';
import { ResumenDeLimpiezaNotificable, ServicioDeNotificaciones } from '../../../../application/ports/out/notificaciones/ServicioDeNotificaciones';
import { NotificacionRepository } from '../../../../application/ports/out/persistencia/repositorios/NotificacionRepository';
import { FormatoDeInforme } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { TipoDeAlertaDePlazo, redactarResumenDeAlertasDePlazo } from '../../../../domain/services/notificaciones/AlertasDePlazo';

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

  async notificarPlazoProximoAVencer(vulnerabilidad: Vulnerabilidad, analistaId: string): Promise<void> {
    const mensaje =
      `Plazo de remediación próximo a vencer (dentro de 48hs): ${vulnerabilidad.cve.valor} ` +
      `(CVSS ${vulnerabilidad.cvssScore.valor}, estado ${vulnerabilidad.estadoRemediacion.valor})`;
    console.log(`[ALERTA RF-100] ${mensaje}`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'PlazoProximoAVencer', analistaId, false, new Date(), mensaje)
    );
  }

  async notificarResumenDeAlertasDePlazo(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidades: Vulnerabilidad[]): Promise<void> {
    if (vulnerabilidades.length === 0) return;
    const mensaje = redactarResumenDeAlertasDePlazo(tipo, vulnerabilidades);
    console.log(`[ALERTA ${tipo === 'PlazoVencido' ? 'RF-76' : 'RF-100'}] ${mensaje}`);
    await this.notificacionRepository.guardar(new Notificacion(randomUUID(), tipo, analistaId, false, new Date(), mensaje));
  }

  async notificarVulnerabilidadCritica(vulnerabilidad: Vulnerabilidad, analistaId: string): Promise<void> {
    const mensaje = `Vulnerabilidad crítica detectada: ${vulnerabilidad.cve.valor} (CVSS ${vulnerabilidad.cvssScore.valor})`;
    console.log(`[ALERTA RF-99] ${mensaje}`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'VulnerabilidadCritica', analistaId, false, new Date(), mensaje)
    );
  }

  async notificarImportacionCompletada(
    analistaId: string,
    resumen: { importados: number; rechazados: number; criticas: number; criterioDeCriticas: string }
  ): Promise<void> {
    const mensaje =
      `Importación completada: ${resumen.importados} importados, ${resumen.rechazados} rechazados` +
      (resumen.criticas > 0 ? `, ${resumen.criticas} crítica(s) detectada(s) (${resumen.criterioDeCriticas})` : '');
    console.log(`[RF-99] ${mensaje}`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'ImportacionCompletada', analistaId, false, new Date(), mensaje)
    );
  }

  async notificarInformeListo(analistaId: string, formato: FormatoDeInforme): Promise<void> {
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

  async notificarPerfilActualizado(analistaId: string, camposModificados: string[]): Promise<void> {
    const mensaje = `Tu perfil fue actualizado: se modificó ${camposModificados.join(' y ')}.`;
    console.log(`[RF-16] ${mensaje} (analista ${analistaId})`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'PerfilActualizado', analistaId, false, new Date(), mensaje)
    );
  }

  async notificarLimpiezaCompletada(analistaId: string, resumen: ResumenDeLimpiezaNotificable): Promise<void> {
    const partes = [
      `Limpieza de "${resumen.nombreArchivo}" completada: se generó la versión ${resumen.version}.`,
      `Registros: ${resumen.filasEliminadas} fila(s) eliminada(s) de ${resumen.filasAntes}, ${resumen.celdasImputadas} valor(es) imputado(s).`,
      resumen.columnasEliminadas.length > 0
        ? `Columnas eliminadas: ${resumen.columnasEliminadas.length} (${resumen.columnasEliminadas.join(', ')}).`
        : 'Columnas eliminadas: ninguna.',
      `Método por variable: ${resumen.metodosPorVariable.map((item) => `${item.variable}: ${item.metodo}`).join('; ')}.`,
      'El detalle completo está en la bitácora del dataset.'
    ];
    const mensaje = partes.join(' ');
    console.log(`[RF-122] ${mensaje} (analista ${analistaId})`);
    await this.notificacionRepository.guardar(
      new Notificacion(randomUUID(), 'LimpiezaCompletada', analistaId, false, new Date(), mensaje)
    );
  }
}
