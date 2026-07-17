import { FiltroFavorito } from '../../domain/entities/FiltroFavorito';
import { ListarFiltrosFavoritosUseCase } from '../ports/in/ListarFiltrosFavoritosUseCase';
import { FiltroFavoritoRepository } from '../ports/out/FiltroFavoritoRepository';

export class ListarFiltrosFavoritos implements ListarFiltrosFavoritosUseCase {
  constructor(private readonly filtroFavoritoRepository: FiltroFavoritoRepository) {}

  async ejecutar(analistaId: string): Promise<FiltroFavorito[]> {
    return this.filtroFavoritoRepository.listarPorAnalista(analistaId);
  }
}
