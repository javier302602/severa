import { httpClient } from './httpClient';

// Contrato verificado contra VulnerabilidadController.ts — GET /:cve NO
// incluye estadoRemediacion (a diferencia de GET /vulnerabilidades/buscar).
// No se inventa ese campo acá: la vista de detalle simplemente no lo puede
// mostrar hoy (ver huecos reportados).
export interface VulnerabilidadDetalle {
  id: string;
  cve: string;
  software: string;
  cvssScore: number;
  tipoAcceso: 'Remoto' | 'Local';
}

export const vulnerabilidadService = {
  obtenerPorCve: (cve: string): Promise<VulnerabilidadDetalle> => httpClient.get(`/vulnerabilidades/${encodeURIComponent(cve)}`)
};
