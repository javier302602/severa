import { httpClient } from './httpClient';
import type { NivelDeRiesgo } from './priorizacionService';

// Contrato verificado contra VulnerabilidadController.ts — GET /:cve NO
// incluye estadoRemediacion (a diferencia de GET /vulnerabilidades/buscar).
// No se inventa ese campo acá: la vista de detalle simplemente no lo puede
// mostrar hoy (ver huecos reportados).
export interface VulnerabilidadDetalle {
  id: string;
  cve: string;
  software: string;
  cvssScore: number;
  // RF-28 / RF-69: el nivel con la escala vigente del analista, y cómo se
  // llama esa escala ("Escala CVSS (por defecto)", "Escala personalizada: …").
  nivelDeRiesgo: NivelDeRiesgo;
  escala: string;
  tipoAcceso: 'Remoto' | 'Local';
}

export const vulnerabilidadService = {
  obtenerPorCve: (cve: string): Promise<VulnerabilidadDetalle> => httpClient.get(`/vulnerabilidades/${encodeURIComponent(cve)}`)
};
