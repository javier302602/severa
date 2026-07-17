import { FiltroFavorito } from '../../../domain/entities/FiltroFavorito';

export interface ListarFiltrosFavoritosUseCase {
  ejecutar(analistaId: string): Promise<FiltroFavorito[]>;
}
