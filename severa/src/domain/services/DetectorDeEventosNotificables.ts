import { Vulnerabilidad } from '../entities/Vulnerabilidad';
import { VariableNumericaVulnerabilidad, obtenerValorNumerico } from './classification/VariablesVulnerabilidad';

// RF-99 (M-13, retoma): el umbral de "crítico" pasa de CVSS >= 9.0 fijo a
// configurable por analista (variable + valor, ver AnalistaRepository.
// obtenerUmbralCritico). NO se toca NivelDeRiesgo.ts/ClasificadorDeRiesgo.ts
// — ese preset sigue siendo la fuente fija de severidad (RF-69); este umbral
// es exclusivo de la notificación de RF-99, un eje distinto (ver auditoría
// de retoma M-13, punto 8: "crítico" vs. "plazo por vencer" no comparten
// umbral). Reutiliza obtenerValorNumerico (M-04) para extraer el valor en
// vez de reimplementar el acceso a cvssScore/diasParaParche acá.
export interface UmbralCritico {
  variable: VariableNumericaVulnerabilidad;
  valor: number;
}

// Default = comportamiento de siempre (CVSS >= 9.0) cuando el analista no
// configuró nada (columnas NULL en `analistas`, ver migración 015) — mismo
// criterio de "resolver el default en código, no en SQL" que
// resolverVariableComponente (M-11).
export const UMBRAL_CRITICO_POR_DEFECTO: UmbralCritico = { variable: 'cvssScore', valor: 9.0 };

// Función pura, sin acceso a datos — el umbral ya resuelto (por analista o
// default) se lo pasa el llamador UNA vez, nunca se consulta acá adentro
// (ver ImportarDatasetConAuditoria.ts/ImportarDatasetDesdeUrl.ts: esto se
// invoca dentro de loops de hasta cientos de miles de filas).
export function esVulnerabilidadCritica(vulnerabilidad: Vulnerabilidad, umbral: UmbralCritico = UMBRAL_CRITICO_POR_DEFECTO): boolean {
  const valor = obtenerValorNumerico(vulnerabilidad, umbral.variable);
  return valor !== undefined && valor >= umbral.valor;
}
