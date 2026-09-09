import { NotificarPlazosProximosAVencerUseCase } from '../../ports/in/module_notificaciones_alertas/NotificarPlazosProximosAVencerUseCase';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../../ports/out/notificaciones/ServicioDeNotificaciones';
import { estaPlazoProximoAVencer } from '../../../domain/services/classification/MotorDePriorizacion';

// Mismo tamaño de lote que GenerarRankingUrgencia.ts (RF-76) — necesario acá
// también: a diferencia de un ranking puntual, este caso de uso recorre
// TODOS los analistas, así que el volumen potencial de notificaciones es
// mayor, no menor.
const TAMANO_DE_LOTE_NOTIFICACIONES = 200;

// RF-100 (M-13, retoma): disparado por el cron diario registrado en
// server.ts (ProgramadorDeTareas/NodeCronProgramadorDeTareas, RF-83 ya
// implementado — no crea scheduler nuevo). A diferencia de
// ProgramarInformePeriodico (opt-in por analista), esta tarea es proactiva y
// global: recorre TODOS los analistas vía AnalistaRepository.listarTodos(),
// no espera que nadie la pida.
export class NotificarPlazosProximosAVencer implements NotificarPlazosProximosAVencerUseCase {
  constructor(
    private readonly analistaRepository: AnalistaRepository,
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  async ejecutar(): Promise<void> {
    const analistas = await this.analistaRepository.listarTodos();

    for (const analista of analistas) {
      const vulnerabilidades = await this.vulnerabilidadRepository.listar(analista.id);
      const proximasAVencer = vulnerabilidades.filter((vulnerabilidad) => estaPlazoProximoAVencer(vulnerabilidad));

      for (let inicio = 0; inicio < proximasAVencer.length; inicio += TAMANO_DE_LOTE_NOTIFICACIONES) {
        const lote = proximasAVencer.slice(inicio, inicio + TAMANO_DE_LOTE_NOTIFICACIONES);
        await Promise.all(
          lote.map((vulnerabilidad) => this.servicioDeNotificaciones.notificarPlazoProximoAVencer(vulnerabilidad, analista.id))
        );
      }
    }
  }
}
