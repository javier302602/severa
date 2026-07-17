import { Vulnerabilidad } from '../entities/Vulnerabilidad';
import { clasificar } from './ClasificadorDeRiesgo';

// RF-99: una vulnerabilidad es notificable como "crítica" cuando su nivel de
// riesgo es 'Crítico'. Deliberadamente NO redefine el umbral CVSS >= 9.0 aquí:
// ese umbral ya vive en NivelDeRiesgoValue.desde() (RF-69, fuente única según
// su propio comentario) y GenerarRankingUrgencia ya lo consume vía
// clasificar(). Reimplementarlo habría creado un tercer lugar con el mismo
// número mágico (ver reporte de huecos del sprint M-13).
export function esVulnerabilidadCritica(vulnerabilidad: Vulnerabilidad): boolean {
  return clasificar(vulnerabilidad.cvssScore).valor === 'Crítico';
}
