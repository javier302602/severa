import { VariableCategoricaVulnerabilidad } from '../../../../domain/services/classification/VariablesVulnerabilidad';
import { CatalogoClasificado } from './EscalaDeClasificacionUseCases';

// M-04 (retoma, RF-28): `variable` generaliza el filtro a cualquier variable
// categórica existente de Vulnerabilidad (tipoAcceso | estadoRemediacion |
// severidad) — Modo A (elegir variable, sin redefinir umbrales/categorías).
// Default 'severidad' si no se especifica, para no romper llamadas
// existentes (URLs y filtros favoritos de M-11 que nunca mandan este
// parámetro).
// RF-28 / RF-69 (Modo B): con 'severidad', `valor` es un nivel de riesgo
// (Bajo, Moderado, Alto, Crítico, o los nombres viejos Baja, Media, Alta,
// Crítica) y se resuelve con la escala del analista.
export interface FiltrarPorCategoriaClasificacionUseCase {
  ejecutar(valor: string, analistaId: string, variable?: VariableCategoricaVulnerabilidad): Promise<CatalogoClasificado>;
}
