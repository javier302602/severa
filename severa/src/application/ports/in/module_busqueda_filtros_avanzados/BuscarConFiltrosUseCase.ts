import { FiltroVulnerabilidad } from '../../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { Paginacion } from '../../out/persistencia/repositorios/VulnerabilidadRepository';
import { CatalogoClasificado } from '../module_priorizacion_clasificacion/EscalaDeClasificacionUseCases';

// RF-88. Devuelve cada resultado con su nivel de riesgo según la escala del
// analista (RF-28/RF-69), la misma con la que se filtró por nivel.
export interface BuscarConFiltrosUseCase {
  ejecutar(filtro: FiltroVulnerabilidad, analistaId: string, paginacion?: Paginacion): Promise<CatalogoClasificado>;
}
