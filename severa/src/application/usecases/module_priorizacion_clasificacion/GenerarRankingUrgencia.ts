import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { GenerarRankingUrgenciaUseCase, OpcionesGenerarRankingUrgencia } from '../../ports/in/module_priorizacion_clasificacion/GenerarRankingUrgenciaUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EmisorDeAlertasDePlazo } from '../module_notificaciones_alertas/EmisorDeAlertasDePlazo';
import { generarRanking, estaPlazoExcedido, EntradaRanking } from '../../../domain/services/classification/MotorDePriorizacion';

export class GenerarRankingUrgencia implements GenerarRankingUrgenciaUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly emisorDeAlertasDePlazo: EmisorDeAlertasDePlazo
  ) {}

  // RF-70/RF-73 generan el ranking; de paso, RF-76 revisa cada entrada no
  // remediada y dispara la alerta si ya superó su plazo recomendado. Se
  // decidió enganchar la alerta aquí (en vez de crear un caso de uso "in"
  // aparte) porque generar el ranking ya recorre todas las vulnerabilidades
  // activas, que es exactamente el conjunto que RF-76 necesita revisar.
  async ejecutar(
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    severidad?: string,
    opciones: OpcionesGenerarRankingUrgencia = {}
  ): Promise<EntradaRanking[]> {
    const lista =
      vulnerabilidades ??
      (severidad
        ? await this.vulnerabilidadRepository.filtrarPorSeveridad(severidad, analistaId)
        : await this.vulnerabilidadRepository.listar(analistaId));
    const ranking = generarRanking(lista, { pesoCriterio: opciones.pesoCriterio, pesoUrgencia: opciones.pesoUrgencia });

    // RF-71: plazosPersonalizados también decide el umbral de RF-76 — con
    // plazos más estrictos/laxos configurados por el analista, la alerta de
    // plazo excedido debe seguir ese mismo umbral, no el default fijo.
    // Generar el ranking es una consulta, y se hace en cada visita a
    // Priorización: el emisor recuerda qué alertas ya salieron, así que solo
    // la primera vez que una vulnerabilidad aparece vencida genera un aviso
    // (antes cada visita volvía a notificar todas las vencidas).
    const vencidas = ranking
      .filter((entrada) => estaPlazoExcedido(entrada.vulnerabilidad, new Date(), opciones.plazosPersonalizados))
      .map((entrada) => entrada.vulnerabilidad);
    await this.emisorDeAlertasDePlazo.emitir(analistaId, 'PlazoVencido', vencidas);

    return ranking;
  }
}
