import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltroVulnerabilidad } from '../../../domain/value-objects/FiltroVulnerabilidad';

export interface BuscarConFiltrosUseCase {
  ejecutar(filtro: FiltroVulnerabilidad): Promise<Vulnerabilidad[]>;
}
