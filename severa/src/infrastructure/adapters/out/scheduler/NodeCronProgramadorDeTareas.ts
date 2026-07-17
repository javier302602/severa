import * as cron from 'node-cron';
import { ProgramadorDeTareas } from '../../../../application/ports/out/ProgramadorDeTareas';

// RF-83: adaptador real del puerto ProgramadorDeTareas (Sprint 10 dejó el
// puerto listo, sin implementación — hueco reportado en Sprints 12/13).
export class NodeCronProgramadorDeTareas implements ProgramadorDeTareas {
  private readonly tareas = new Map<string, cron.ScheduledTask>();

  programar(id: string, expresionCron: string, tarea: () => Promise<void>): void {
    // Reemplaza SOLO la tarea con este id exacto (p. ej. si el mismo
    // analista llama POST /informes/programar dos veces) — nunca afecta a
    // otras entradas del Map. RF-83 (Sprint 14): ProgramarInformePeriodico
    // ahora scopea el id por analistaId, así que dos analistas distintos
    // conviven aquí como dos tareas independientes sin pisarse.
    this.tareas.get(id)?.stop();

    const tareaProgramada = cron.schedule(expresionCron, () => {
      tarea().catch((error) => {
        console.error(`[ProgramadorDeTareas] Error ejecutando la tarea "${id}":`, error);
      });
    });

    this.tareas.set(id, tareaProgramada);
  }

  cancelar(id: string): void {
    this.tareas.get(id)?.stop();
    this.tareas.delete(id);
  }
}
