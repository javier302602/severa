import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltroVulnerabilidad } from '../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { Paginacion } from '../out/VulnerabilidadRepository';

export interface BuscarConFiltrosUseCase {
  ejecutar(filtro: FiltroVulnerabilidad, analistaId: string, paginacion?: Paginacion): Promise<Vulnerabilidad[]>;
}
