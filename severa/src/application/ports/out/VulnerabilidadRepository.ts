import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { EstadoRemediacion } from '../../../domain/value-objects/EstadoRemediacion';
import { FiltroVulnerabilidad } from '../../../domain/value-objects/FiltroVulnerabilidad';

export interface VulnerabilidadRepository {
  guardar(vulnerabilidad: Vulnerabilidad): Promise<void>;
  contar(): Promise<number>;
  listar(): Promise<Vulnerabilidad[]>;
  buscarPorCve(cve: string): Promise<Vulnerabilidad | null>;
  filtrarPorRangoCvss(cvssMin: number, cvssMax: number): Promise<Vulnerabilidad[]>;
  filtrarPorSeveridad(severidad: string): Promise<Vulnerabilidad[]>;
  listarPorTipoAcceso(tipoAcceso: 'Remoto' | 'Local'): Promise<Vulnerabilidad[]>;
  listarPorTipoVulnerabilidad(tipoVulnerabilidad: string): Promise<Vulnerabilidad[]>;
  listarPorSoftware(software: string): Promise<Vulnerabilidad[]>;
  actualizarEstado(cve: string, estado: EstadoRemediacion, fechaRemediacion?: Date): Promise<void>;
  // RF-88: combina en una sola consulta todos los criterios presentes en el filtro.
  buscarConFiltros(filtro: FiltroVulnerabilidad): Promise<Vulnerabilidad[]>;
}
