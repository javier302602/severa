import { FiltroFavorito } from '../../../domain/entities/FiltroFavorito';
import { CriteriosFiltroVulnerabilidad } from '../../../domain/value-objects/FiltroVulnerabilidad';

export interface GuardarFiltroFavoritoUseCase {
  ejecutar(input: {
    analistaId: string;
    nombre: string;
    criterios: CriteriosFiltroVulnerabilidad;
  }): Promise<FiltroFavorito>;
}
