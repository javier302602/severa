import { NotificarPlazosProximosAVencerUseCase } from '../../ports/in/module_notificaciones_alertas/NotificarPlazosProximosAVencerUseCase';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EmisorDeAlertasDePlazo } from './EmisorDeAlertasDePlazo';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { escalaVigente } from '../module_priorizacion_clasificacion/EscalaDeClasificacion';
import { estaPlazoProximoAVencer } from '../../../domain/services/classification/MotorDePriorizacion';

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
    private readonly emisorDeAlertasDePlazo: EmisorDeAlertasDePlazo,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  async ejecutar(): Promise<void> {
    const analistas = await this.analistaRepository.listarTodos();
    const fallos: string[] = [];

    for (const analista of analistas) {
      // RF-28 / RF-69: el plazo de cada vulnerabilidad depende de su nivel según
      // la escala de ESTE analista. Se lee una sola vez por analista, no una por
      // vulnerabilidad.
      const { escala } = await escalaVigente(this.escalaRepository, analista.id);
      const vulnerabilidades = await this.vulnerabilidadRepository.listar(analista.id);
      const proximasAVencer = vulnerabilidades.filter((vulnerabilidad) => estaPlazoProximoAVencer(vulnerabilidad, escala));

      // Una vulnerabilidad pasa dos días dentro de la ventana de 48 horas y
      // esta tarea corre todos los días: el emisor evita el segundo aviso.
      try {
        await this.emisorDeAlertasDePlazo.emitir(analista.id, 'PlazoProximoAVencer', proximasAVencer);
      } catch (error) {
        // Un fallo con un analista no puede dejar sin aviso a los que vienen
        // después en la lista. Se sigue, y el error se informa al final.
        fallos.push(`${analista.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (fallos.length > 0) {
      throw new Error(`No se pudieron emitir las alertas de plazo de ${fallos.length} analista(s): ${fallos.join('; ')}`);
    }
  }
}
