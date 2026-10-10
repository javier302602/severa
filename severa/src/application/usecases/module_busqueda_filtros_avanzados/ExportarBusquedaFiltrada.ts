import { FiltroVulnerabilidad } from '../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { ExportarBusquedaFiltradaUseCase } from '../../ports/in/module_busqueda_filtros_avanzados/ExportarBusquedaFiltradaUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { ExportadorDeCatalogoAgrupado } from '../../ports/out/exportacion/ExportadorDeCatalogoAgrupado';
import { escalaVigente } from '../module_priorizacion_clasificacion/EscalaDeClasificacion';

// RF-90: la búsqueda filtrada en un .xlsx agrupado por nivel de riesgo.
// RF-28 / RF-69: se filtra y se agrupa con la MISMA escala (la vigente del
// analista, leída una sola vez), y el archivo dice cuál fue.
export class ExportarBusquedaFiltrada implements ExportarBusquedaFiltradaUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository,
    private readonly exportador: ExportadorDeCatalogoAgrupado
  ) {}

  async ejecutar(filtro: FiltroVulnerabilidad, analistaId: string): Promise<Buffer> {
    const { escala } = await escalaVigente(this.escalaRepository, analistaId);
    const items = await this.vulnerabilidadRepository.buscarConFiltros(filtro, analistaId, escala);
    return this.exportador.exportar(items, escala);
  }
}
