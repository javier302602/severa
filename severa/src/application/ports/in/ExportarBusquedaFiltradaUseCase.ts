import { FiltroVulnerabilidad } from '../../../domain/shared/value-objects/FiltroVulnerabilidad';

export interface ExportarBusquedaFiltradaUseCase {
  ejecutar(filtro: FiltroVulnerabilidad, analistaId: string): Promise<Buffer>;
}
