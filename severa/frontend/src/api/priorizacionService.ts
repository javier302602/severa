import { httpClient } from './httpClient';
import type { EstadoRemediacion } from '../types/EstadoRemediacion';

// Contrato verificado contra PriorizacionController.ts.
export type NivelDeRiesgo = 'Bajo' | 'Moderado' | 'Alto' | 'Crítico';

export interface EntradaRanking {
  posicion: number;
  cve: string;
  cvssScore: number;
  nivelDeRiesgo: NivelDeRiesgo;
  diasParaParche: number | null;
  estado: EstadoRemediacion;
}

export interface ResultadoCambioEstado {
  cve: string;
  estado: EstadoRemediacion;
  fechaRemediacion: string | null;
}

export const priorizacionService = {
  obtenerRanking: (): Promise<EntradaRanking[]> => httpClient.get('/priorizacion/ranking'),
  // Transición lineal Pendiente -> EnProceso -> Remediada (EstadoRemediacion.ts,
  // backend): pedir un salto inválido responde 409, no 400.
  marcarEstado: (cve: string, estado: 'EnProceso' | 'Remediada'): Promise<ResultadoCambioEstado> =>
    httpClient.patch(`/vulnerabilidades/${encodeURIComponent(cve)}/estado`, { estado })
};
