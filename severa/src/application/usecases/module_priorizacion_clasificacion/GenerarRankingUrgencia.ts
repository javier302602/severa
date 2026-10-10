import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import {
  GenerarRankingUrgenciaUseCase,
  OpcionesGenerarRankingUrgencia,
  RankingDeUrgencia
} from '../../ports/in/module_priorizacion_clasificacion/GenerarRankingUrgenciaUseCase';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { escalaVigente } from './EscalaDeClasificacion';
import { nivelDeRiesgoDesdeTexto } from '../../../domain/shared/value-objects/EscalaDeClasificacion';
import { VariableDeConsultaInvalidaError } from '../../../domain/errors/VariableDeConsultaInvalidaError';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EmisorDeAlertasDePlazo } from '../module_notificaciones_alertas/EmisorDeAlertasDePlazo';
import { generarRanking, estaPlazoExcedido } from '../../../domain/services/classification/MotorDePriorizacion';

export class GenerarRankingUrgencia implements GenerarRankingUrgenciaUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly emisorDeAlertasDePlazo: EmisorDeAlertasDePlazo,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  // RF-70/RF-73 generan el ranking; de paso, RF-76 revisa cada entrada no
  // remediada y dispara la alerta si ya superó su plazo recomendado. Se
  // decidió enganchar la alerta aquí (en vez de crear un caso de uso "in"
  // aparte) porque generar el ranking ya recorre todas las vulnerabilidades
  // activas, que es exactamente el conjunto que RF-76 necesita revisar.
  async ejecutar(
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    nivel?: string,
    opciones: OpcionesGenerarRankingUrgencia = {}
  ): Promise<RankingDeUrgencia> {
    // RF-28 / RF-69 (Modo B): los niveles, los grupos dentro de los que se
    // pondera y los plazos salen de la escala del analista. La carga por nivel
    // ("carga por etapas") es un rango de cvss_score en SQL, como el filtro del
    // catálogo: ya no se lee la columna severidad.
    const escala = await escalaVigente(this.escalaRepository, analistaId);
    let lista: Vulnerabilidad[];
    if (vulnerabilidades) {
      lista = vulnerabilidades;
    } else if (nivel) {
      const nivelPedido = nivelDeRiesgoDesdeTexto(nivel);
      if (!nivelPedido) {
        throw new VariableDeConsultaInvalidaError('"' + nivel + '" no es un nivel de riesgo: usá Bajo, Moderado, Alto o Crítico');
      }
      lista = await this.vulnerabilidadRepository.filtrarPorNivelDeRiesgo(escala.escala.rango(nivelPedido), analistaId);
    } else {
      lista = await this.vulnerabilidadRepository.listar(analistaId);
    }
    const entradas = generarRanking(lista, escala.escala, { pesoCriterio: opciones.pesoCriterio, pesoUrgencia: opciones.pesoUrgencia });

    // RF-76. LIMITACIÓN CONOCIDA (pendiente de la tanda f del Paso 2): los
    // plazos que llegan por parámetro también deciden qué se avisa como
    // vencido, y esas alertas quedan registradas. Esta tanda no lo cambia.
    const vencidas = entradas
      .filter((entrada) => estaPlazoExcedido(entrada.vulnerabilidad, escala.escala, new Date(), opciones.plazosPersonalizados))
      .map((entrada) => entrada.vulnerabilidad);
    await this.emisorDeAlertasDePlazo.emitir(analistaId, 'PlazoVencido', vencidas);

    return { escala, entradas };
  }
}
