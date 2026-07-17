import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { GenerarRankingUrgenciaUseCase } from '../ports/in/GenerarRankingUrgenciaUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../ports/out/ServicioDeNotificaciones';
import { generarRanking, estaPlazoExcedido, EntradaRanking } from '../../domain/services/MotorDePriorizacion';

export class GenerarRankingUrgencia implements GenerarRankingUrgenciaUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones
  ) {}

  // RF-70/RF-73 generan el ranking; de paso, RF-76 revisa cada entrada no
  // remediada y dispara la alerta si ya superó su plazo recomendado. Se
  // decidió enganchar la alerta aquí (en vez de crear un caso de uso "in"
  // aparte) porque generar el ranking ya recorre todas las vulnerabilidades
  // activas, que es exactamente el conjunto que RF-76 necesita revisar.
  async ejecutar(vulnerabilidades?: Vulnerabilidad[], analistaId?: string): Promise<EntradaRanking[]> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar();
    const ranking = generarRanking(lista);

    await Promise.all(
      ranking
        .filter((entrada) => estaPlazoExcedido(entrada.vulnerabilidad))
        .map((entrada) => this.servicioDeNotificaciones.notificarPlazoExcedido(entrada.vulnerabilidad, analistaId))
    );

    return ranking;
  }
}
