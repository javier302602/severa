import { FiltroVulnerabilidad } from '../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { BuscarConFiltrosUseCase } from '../../ports/in/module_busqueda_filtros_avanzados/BuscarConFiltrosUseCase';
import { VulnerabilidadRepository, Paginacion } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { CatalogoClasificado } from '../../ports/in/module_priorizacion_clasificacion/EscalaDeClasificacionUseCases';
import { clasificarConEscala, escalaVigente } from '../module_priorizacion_clasificacion/EscalaDeClasificacion';

// RF-88 (catálogo y búsqueda avanzada). RF-28 / RF-69 (Modo B): el filtro por
// nivel y el nivel de cada resultado usan la misma escala, la vigente del
// analista, leída una sola vez por búsqueda.
export class BuscarConFiltros implements BuscarConFiltrosUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository
  ) {}

  async ejecutar(filtro: FiltroVulnerabilidad, analistaId: string, paginacion?: Paginacion): Promise<CatalogoClasificado> {
    const escala = await escalaVigente(this.escalaRepository, analistaId);
    const vulnerabilidades = await this.vulnerabilidadRepository.buscarConFiltros(filtro, analistaId, escala.escala, paginacion);
    return { escala, vulnerabilidades: clasificarConEscala(vulnerabilidades, escala.escala) };
  }
}
