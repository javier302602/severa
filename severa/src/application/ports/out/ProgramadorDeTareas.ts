// RF-83. Puerto preparado, sin adaptador real todavía (requiere elegir e
// instalar una librería de scheduling, p. ej. node-cron — pendiente de
// confirmación). "tarea" es la función a ejecutar en cada disparo del cron.
export interface ProgramadorDeTareas {
  programar(id: string, expresionCron: string, tarea: () => Promise<void>): void;
  cancelar(id: string): void;
}
