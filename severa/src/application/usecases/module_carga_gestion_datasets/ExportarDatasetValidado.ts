import { ExportarDatasetValidadoUseCase } from '../../ports/in/module_carga_gestion_datasets/ExportarDatasetValidadoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { EscalaDeClasificacionRepository } from '../../ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { ExportadorDeCatalogoAgrupado } from '../../ports/out/exportacion/ExportadorDeCatalogoAgrupado';
import { escalaVigente } from '../module_priorizacion_clasificacion/EscalaDeClasificacion';

// RF-24: el catálogo completo en un .xlsx agrupado por nivel de riesgo, con
// la escala vigente del analista (RF-28 / RF-69) — la misma que usa la
// exportación de la búsqueda filtrada (RF-90), que comparte el exportador.
export class ExportarDatasetValidado implements ExportarDatasetValidadoUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly escalaRepository: EscalaDeClasificacionRepository,
    private readonly exportador: ExportadorDeCatalogoAgrupado
  ) {}

  async ejecutar(analistaId: string): Promise<Buffer> {
    const { escala } = await escalaVigente(this.escalaRepository, analistaId);
    const items = await this.vulnerabilidadRepository.listar(analistaId);
    return this.exportador.exportar(items, escala);
  }
}
