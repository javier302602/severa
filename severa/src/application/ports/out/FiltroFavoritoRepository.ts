import { FiltroFavorito } from '../../../domain/entities/FiltroFavorito';

export interface FiltroFavoritoRepository {
  guardar(filtroFavorito: FiltroFavorito): Promise<void>;
  listarPorAnalista(analistaId: string): Promise<FiltroFavorito[]>;
}
