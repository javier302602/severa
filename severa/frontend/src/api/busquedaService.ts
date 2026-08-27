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

// Paginación (2026-07-19): un filtro amplio (ej. severidad=Alta) sobre un
// catálogo grande podía traer decenas de miles de filas de una sola vez —
// TAMANO_PAGINA coincide con el límite por defecto de BusquedaController.
export const TAMANO_PAGINA = 200;

export const busquedaService = {
  buscar: (criterios: CriteriosBusqueda, pagina = 1): Promise<VulnerabilidadBusqueda[]> =>
    httpClient.get('/vulnerabilidades/buscar', { ...criteriosAQuery(criterios), pagina, limite: TAMANO_PAGINA }),
  // Mismos criterios que /buscar (parseCriterios es compartido en
  // BusquedaController.ts). Bug real reportado: la descarga era CSV plano —
  // ahora es un .xlsx real agrupado por severidad (ver
  // ExportadorExcelAgrupado.ts), que httpClient resuelve como Blob (no es
  // text/csv, cae en la rama .blob() de leerCuerpoDeRespuesta).
  exportar: (criterios: CriteriosBusqueda): Promise<Blob> =>
    httpClient.get('/vulnerabilidades/buscar/exportar', criteriosAQuery(criterios))
};
