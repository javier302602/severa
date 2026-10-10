import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { EntradaRanking, PlazosPersonalizados } from '../../../../domain/services/classification/MotorDePriorizacion';
import { EscalaVigente } from './EscalaDeClasificacionUseCases';

// RF-71/RF-73 (auditoría M-09, frente B): configuración opcional por
// llamada, sin persistencia — mismo criterio de "menor fricción" que `nivel`
// en este mismo puerto. Si no vienen, el comportamiento es el default
// (PLAZOS_RECOMENDADOS_EN_DIAS, pesos 0.7/0.3).
export interface OpcionesGenerarRankingUrgencia {
  plazosPersonalizados?: PlazosPersonalizados;
  pesoCriterio?: number;
  pesoUrgencia?: number;
}

// RF-70 + RF-28/RF-69: el ranking viene con la escala con la que se armaron
// sus niveles (y sus plazos), para que la pantalla la diga.
export interface RankingDeUrgencia {
  escala: EscalaVigente;
  entradas: EntradaRanking[];
}

export interface GenerarRankingUrgenciaUseCase {
  // analistaId cumple doble función: (1) aísla el ranking al catálogo del
  // analista que lo pide (multi-tenancy), y (2) es el destinatario de las
  // alertas de plazo excedido que dispare esta llamada (RF-76).
  // nivel ("carga por etapas"): opcional — si viene, el ranking se genera
  // SOLO sobre ese nivel de riesgo (Bajo, Moderado, Alto, Crítico; se aceptan
  // los nombres viejos), filtrado en SQL por el rango de CVSS que le da la
  // escala del analista, en vez de traer todo el catálogo de una vez.
  ejecutar(
    analistaId: string,
    vulnerabilidades?: Vulnerabilidad[],
    nivel?: string,
    opciones?: OpcionesGenerarRankingUrgencia
  ): Promise<RankingDeUrgencia>;
}
