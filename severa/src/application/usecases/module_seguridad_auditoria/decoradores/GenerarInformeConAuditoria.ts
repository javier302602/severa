import { GenerarInformeUseCase } from '../../../ports/in/module_reportes_exportacion/GenerarInformeUseCase';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../ports/out/notificaciones/ServicioDeNotificaciones';
import { RegistrarAnalisisRealizadoUseCase } from '../../../ports/in/module_perfil_analista/RegistrarAnalisisRealizadoUseCase';

// RF-95: registra fecha, autor y tipo de cada informe generado. Mismo motivo
// que los decoradores de remediación para no implementar GenerarInformeUseCase
// tal cual: el "autor" (analistaId) viene del token HTTP, no del propio caso
// de uso. RF-101 (Sprint 13): aprovecha ese mismo analistaId, ya disponible
// aquí, para notificar que el informe quedó listo — no hace falta un tercer
// decorador ni pasar el id de nuevo por otro lado.
//
// Auditoría M-12: además de registros_auditoria (global, solo lectura para
// administradores vía GET /auditoria), ahora también alimenta
// analisis_realizados (RF-11/M-02) — infraestructura que existía desde M-02
// pero sin ningún productor conectado (ver container.ts). Esto le da a cada
// analista su propio historial de informes vía GET /perfil/historial, sin
// depender del rol de administrador. Este decorador ya es compartido entre
// la ruta manual y ProgramarInformePeriodico (RF-83), así que conectarlo acá
// cubre ambos casos de una sola vez.
export class GenerarInformeConAuditoria {
  constructor(
    private readonly usecase: GenerarInformeUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones,
    private readonly registrarAnalisisRealizadoUseCase: RegistrarAnalisisRealizadoUseCase
  ) {}

  async ejecutar(formato: 'pdf' | 'docx', analistaId: string): Promise<Buffer> {
    const buffer = await this.usecase.ejecutar(formato, analistaId);

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'GenerarInforme',
      detalle: `Informe completo (${formato})`
    });

    await this.registrarAnalisisRealizadoUseCase.ejecutar({
      analistaId,
      tipoEvento: 'InformeGenerado',
      payload: { formato }
    });

    await this.servicioDeNotificaciones.notificarInformeListo(analistaId, formato);

    return buffer;
  }
}
