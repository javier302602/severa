import { GenerarInformeUseCase } from '../../ports/in/GenerarInformeUseCase';
import { AuditoriaRepository } from '../../ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../ports/out/ServicioDeNotificaciones';

// RF-95: registra fecha, autor y tipo de cada informe generado. Mismo motivo
// que los decoradores de remediación para no implementar GenerarInformeUseCase
// tal cual: el "autor" (analistaId) viene del token HTTP, no del propio caso
// de uso. RF-101 (Sprint 13): aprovecha ese mismo analistaId, ya disponible
// aquí, para notificar que el informe quedó listo — no hace falta un tercer
// decorador ni pasar el id de nuevo por otro lado.
export class GenerarInformeConAuditoria {
  constructor(
    private readonly usecase: GenerarInformeUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  async ejecutar(formato: 'pdf' | 'docx', analistaId: string): Promise<Buffer> {
    const buffer = await this.usecase.ejecutar(formato, analistaId);

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'GenerarInforme',
      detalle: `Informe completo (${formato})`
    });

    await this.servicioDeNotificaciones.notificarInformeListo(analistaId, formato);

    return buffer;
  }
}
