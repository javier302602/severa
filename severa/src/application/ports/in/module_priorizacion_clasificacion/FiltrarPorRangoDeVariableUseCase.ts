import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { VariableNumericaVulnerabilidad } from '../../../../domain/services/classification/VariablesVulnerabilidad';

// M-04 (retoma, RF-27): `variable` generaliza el filtro a cualquier variable
// numérica existente de Vulnerabilidad (cvssScore | diasParaParche) — Modo A
// (elegir variable, sin redefinir umbrales). Default 'cvssScore' si no se
// especifica, para no romper llamadas existentes (URLs y filtros favoritos
// de M-11 que nunca mandan este parámetro).
export interface FiltrarPorRangoDeVariableUseCase {
  ejecutar(minimo: number, maximo: number, analistaId: string, variable?: VariableNumericaVulnerabilidad): Promise<Vulnerabilidad[]>;
}
