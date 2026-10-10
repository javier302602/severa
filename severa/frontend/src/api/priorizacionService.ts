import { httpClient } from './httpClient';
import type { EstadoRemediacion } from '../types/EstadoRemediacion';

// Contrato verificado contra PriorizacionController.ts.
export type NivelDeRiesgo = 'Bajo' | 'Moderado' | 'Alto' | 'Crítico';

export interface EntradaRanking {
  posicion: number;
  cve: string;
  cvssScore: number;
  // RF-28 / RF-69: con la escala vigente del analista.
  nivelDeRiesgo: NivelDeRiesgo;
  // RF-71: el plazo recomendado (en días) para su nivel.
  plazoRecomendado: number;
  diasParaParche: number | null;
  estado: EstadoRemediacion;
}

export interface ResultadoCambioEstado {
  cve: string;
  estado: EstadoRemediacion;
  fechaRemediacion: string | null;
}

export const priorizacionService = {
  // nivel ("carga por etapas", 2026-07-19): un nivel de riesgo por vez; el
  // backend lo resuelve con la escala del analista (rango de CVSS). Sin nivel,
  // el ranking completo del catálogo.
  obtenerRanking: (nivel?: NivelDeRiesgo): Promise<EntradaRanking[]> =>
    httpClient.get('/priorizacion/ranking', nivel ? { nivel } : undefined),
  // Transición lineal Pendiente -> EnProceso -> Remediada (EstadoRemediacion.ts,
  // backend): pedir un salto inválido responde 409, no 400.
  marcarEstado: (cve: string, estado: 'EnProceso' | 'Remediada'): Promise<ResultadoCambioEstado> =>
    httpClient.patch(`/vulnerabilidades/${encodeURIComponent(cve)}/estado`, { estado })
};
