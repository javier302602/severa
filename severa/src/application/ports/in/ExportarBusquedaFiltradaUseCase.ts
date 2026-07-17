import { FiltroVulnerabilidad } from '../../../domain/value-objects/FiltroVulnerabilidad';

export interface ExportarBusquedaFiltradaUseCase {
  ejecutar(filtro: FiltroVulnerabilidad): Promise<string>;
}
