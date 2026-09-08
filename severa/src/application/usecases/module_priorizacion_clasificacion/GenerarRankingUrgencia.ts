import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { GenerarRankingUrgenciaUseCase, OpcionesGenerarRankingUrgencia } from '../../ports/in/module_priorizacion_clasificacion/GenerarRankingUrgenciaUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../../ports/out/notificaciones/ServicioDeNotificaciones';
import { generarRanking, estaPlazoExcedido, EntradaRanking } from '../../../domain/services/classification/MotorDePriorizacion';

// Tamaño de lote para las notificaciones de plazo excedido (2026-07-19) —
// mismo criterio que ImportarDataset.ts/guardarLote: antes esto disparaba
// TODAS las notificaciones de la llamada en un solo Promise.all sin límite;
// medido en vivo con 343.000 filas reales, un catálogo grande puede generar
// decenas de miles de INSERTs concurrentes contra Postgres, saturando el
// pool de conexiones (pg.Pool tiene un máximo chico de conexiones) y
// haciendo que la respuesta entera espere a que se liberen — el mismo
// síntoma que "Priorización muy lenta". Lotes chicos y secuenciales entre
// sí (no todo en paralelo) acotan cuántas conexiones pide esta llamada a la
// vez, sin cambiar qué se notifica ni a quién.
const TAMANO_DE_LOTE_NOTIFICACIONES = 200;

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
    const vencidas = ranking.filter((entrada) => estaPlazoExcedido(entrada.vulnerabilidad, new Date(), opciones.plazosPersonalizados));
    for (let inicio = 0; inicio < vencidas.length; inicio += TAMANO_DE_LOTE_NOTIFICACIONES) {
      const lote = vencidas.slice(inicio, inicio + TAMANO_DE_LOTE_NOTIFICACIONES);
      await Promise.all(lote.map((entrada) => this.servicioDeNotificaciones.notificarPlazoExcedido(entrada.vulnerabilidad, analistaId)));
    }

    return ranking;
  }
}
