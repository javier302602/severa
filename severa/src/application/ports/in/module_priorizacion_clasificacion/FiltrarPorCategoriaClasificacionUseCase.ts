import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { VariableCategoricaVulnerabilidad } from '../../../../domain/services/classification/VariablesVulnerabilidad';

// M-04 (retoma, RF-28): `variable` generaliza el filtro a cualquier variable
// categórica existente de Vulnerabilidad (tipoAcceso | estadoRemediacion |
// severidad) — Modo A (elegir variable, sin redefinir umbrales/categorías).
// Default 'severidad' si no se especifica, para no romper llamadas
// existentes (URLs y filtros favoritos de M-11 que nunca mandan este
// parámetro).
export interface FiltrarPorCategoriaClasificacionUseCase {
  ejecutar(valor: string, analistaId: string, variable?: VariableCategoricaVulnerabilidad): Promise<Vulnerabilidad[]>;
}
