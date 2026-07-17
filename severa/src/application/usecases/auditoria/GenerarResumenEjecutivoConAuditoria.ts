import { GenerarResumenEjecutivoUseCase } from '../../ports/in/GenerarResumenEjecutivoUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../ports/out/ServicioDeNotificaciones';

// RF-95: ver el comentario equivalente en GenerarInformeConAuditoria. RF-101
// (Sprint 13, corregido tras revisión M-13): un resumen ejecutivo es un
// informe generado igual que el completo — no hay razón para excluirlo de la
// notificación de "informe listo". Siempre en pdf (ver GenerarResumenEjecutivo).
export class GenerarResumenEjecutivoConAuditoria {
  constructor(
    private readonly usecase: GenerarResumenEjecutivoUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  async ejecutar(analistaId: string): Promise<Buffer> {
    const buffer = await this.usecase.ejecutar();

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'GenerarInforme',
      detalle: 'Resumen ejecutivo (pdf)'
    });

    await this.servicioDeNotificaciones.notificarInformeListo(analistaId, 'pdf');

    return buffer;
  }
}
