import { GenerarInformeUseCase } from '../../../ports/in/module_reportes_exportacion/GenerarInformeUseCase';
import { ArchivoGenerado, FormatoDeInforme, OpcionesDeInforme } from '../../../ports/out/reportes/GeneradorDeInformes';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../ports/out/notificaciones/ServicioDeNotificaciones';
import { RegistrarEnHistorialDeAnalisisUseCase } from '../../../ports/in/module_perfil_analista/RegistrarEnHistorialDeAnalisisUseCase';

// RF-95: registra fecha, autor y tipo de cada informe generado. Mismo motivo
// que los decoradores de remediación para no implementar GenerarInformeUseCase
// tal cual: el "autor" (analistaId) viene del token HTTP, no del propio caso
// de uso. RF-101 (Sprint 13): aprovecha ese mismo analistaId, ya disponible
// aquí, para notificar que el informe quedó listo — no hace falta un tercer
// decorador ni pasar el id de nuevo por otro lado.
//
// RF-11 (M-02): además de registros_auditoria (global, solo lectura para
// administradores vía GET /auditoria), cada informe queda en el historial de
// análisis del propio analista (GET /perfil/historial), sin depender del rol
// de administrador. Este decorador es compartido entre la ruta manual y
// ProgramarInformePeriodico (RF-83), así que cubre ambos casos de una vez.
export class GenerarInformeConAuditoria {
  constructor(
    private readonly usecase: GenerarInformeUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones,
    private readonly historial: RegistrarEnHistorialDeAnalisisUseCase
  ) {}

  async ejecutar(formato: FormatoDeInforme, analistaId: string, opciones: OpcionesDeInforme = {}): Promise<ArchivoGenerado> {
    const archivo = await this.usecase.ejecutar(formato, analistaId, opciones);

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'GenerarInforme',
      detalle: `Informe completo (${formato}${opciones.adjuntarGraficos ? ', con gráficos adjuntos' : ''})`
    });

    await this.historial.delCatalogo(analistaId, 'InformeGenerado', { cadaVez: true, detalle: `Formato ${formato.toUpperCase()}` });

    await this.servicioDeNotificaciones.notificarInformeListo(analistaId, formato);

    return archivo;
  }
}
