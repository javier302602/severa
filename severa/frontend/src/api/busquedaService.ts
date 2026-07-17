import { httpClient } from './httpClient';
import type { EstadoRemediacion } from '../types/EstadoRemediacion';

// Contrato verificado contra BusquedaController.ts. FiltroVulnerabilidad
// (backend) exige al menos un criterio presente, o lanza FiltroVacioError
// (400) — el formulario del catálogo replica esa misma regla antes de
// llamar a este servicio, para no depender de que el backend la rechace.
export interface CriteriosBusqueda {
  cve?: string;
  cvssMin?: number;
  cvssMax?: number;
  severidad?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  componente?: string;
  estadoRemediacion?: EstadoRemediacion;
}

export interface VulnerabilidadBusqueda {
  cve: string;
  cvssScore: number;
  software: string;
  estadoRemediacion: EstadoRemediacion;
  fechaCarga: string;
}

function criteriosAQuery(criterios: CriteriosBusqueda) {
  return {
    cve: criterios.cve,
    cvssMin: criterios.cvssMin,
    cvssMax: criterios.cvssMax,
    severidad: criterios.severidad,
    fechaDesde: criterios.fechaDesde,
    fechaHasta: criterios.fechaHasta,
    componente: criterios.componente,
    estadoRemediacion: criterios.estadoRemediacion
  };
}

export const busquedaService = {
  buscar: (criterios: CriteriosBusqueda): Promise<VulnerabilidadBusqueda[]> =>
    httpClient.get('/vulnerabilidades/buscar', criteriosAQuery(criterios)),
  // Mismos criterios que /buscar (parseCriterios es compartido en
  // BusquedaController.ts) — GET /vulnerabilidades/buscar/exportar devuelve
  // texto CSV plano (Content-Type: text/csv), que httpClient ya resuelve
  // como string (ver leerCuerpoDeRespuesta).
  exportar: (criterios: CriteriosBusqueda): Promise<string> =>
    httpClient.get('/vulnerabilidades/buscar/exportar', criteriosAQuery(criterios))
};
