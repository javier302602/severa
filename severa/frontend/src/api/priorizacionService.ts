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

// Severidad, no NivelDeRiesgo: son las etiquetas reales de la columna
// "severidad" en la base (PostgresVulnerabilidadRepository.calcularSeveridad),
// no los nombres del dominio (NivelDeRiesgo usa "Moderado"/"Crítico", la
// columna usa "Media"/"Crítica") — mismo query param que ya acepta
// buscarConFiltros.
export type SeveridadFiltro = 'Crítica' | 'Alta' | 'Media' | 'Baja';

export const priorizacionService = {
  // severidad (2026-07-19, "carga por etapas"): sin especificar, se
  // comporta como siempre (ranking completo del catálogo).
  obtenerRanking: (severidad?: SeveridadFiltro): Promise<EntradaRanking[]> =>
    httpClient.get('/priorizacion/ranking', severidad ? { severidad } : undefined),
  // Transición lineal Pendiente -> EnProceso -> Remediada (EstadoRemediacion.ts,
  // backend): pedir un salto inválido responde 409, no 400.
  marcarEstado: (cve: string, estado: 'EnProceso' | 'Remediada'): Promise<ResultadoCambioEstado> =>
    httpClient.patch(`/vulnerabilidades/${encodeURIComponent(cve)}/estado`, { estado })
};
