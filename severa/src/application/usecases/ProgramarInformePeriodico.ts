import { ProgramarInformePeriodicoUseCase, FrecuenciaInformePeriodico } from '../ports/in/ProgramarInformePeriodicoUseCase';
import { ProgramadorDeTareas } from '../ports/out/ProgramadorDeTareas';
import { GenerarInformeConAuditoria } from './auditoria/GenerarInformeConAuditoria';

// RF-83: mapea la frecuencia elegida por el analista a una expresión cron y
// registra la tarea en el puerto de scheduling. Adaptador real conectado en
// container.ts desde Sprint 14 (NodeCronProgramadorDeTareas) — hueco cerrado.
const EXPRESION_CRON: Record<FrecuenciaInformePeriodico, string> = {
  semanal: '0 0 * * 1', // cada lunes a medianoche
  mensual: '0 0 1 * *'  // el día 1 de cada mes a medianoche
};

// El id de tarea incluye el analistaId a propósito: antes era una constante
// global ('informe-periodico'), así que el segundo analista que llamara
// POST /informes/programar pisaba silenciosamente la programación del
// primero (hueco reportado al cerrar RF-83, Sprint 14). Con el id scopeado
// por analista, NodeCronProgramadorDeTareas (que ya reemplaza por id, nunca
// globalmente) solo reemplaza la programación del MISMO analista si vuelve a
// llamar, y deja intactas las de los demás.
function idTareaInformePeriodico(analistaId: string): string {
  return `informe-periodico-${analistaId}`;
}

export class ProgramarInformePeriodico implements ProgramarInformePeriodicoUseCase {
  constructor(
    private readonly programadorDeTareas: ProgramadorDeTareas,
    // Depende directamente del decorador auditado/notificado (mismo patrón
    // que SincronizarConApiNvd con ImportarDatasetConAuditoria): el
    // analistaId de quién programó la tarea se captura al llamar ejecutar()
    // y queda cerrado en el closure del cron, para que cada informe generado
    // automáticamente quede auditado (RF-95) y notificado (RF-101) a nombre
    // de quien lo programó — no existe un "analista del sistema" inventado.
    private readonly generarInformeUseCase: GenerarInformeConAuditoria
  ) {}

  async ejecutar(frecuencia: FrecuenciaInformePeriodico, analistaId: string): Promise<void> {
    this.programadorDeTareas.programar(idTareaInformePeriodico(analistaId), EXPRESION_CRON[frecuencia], async () => {
      await this.generarInformeUseCase.ejecutar('pdf', analistaId);
    });
  }
}
