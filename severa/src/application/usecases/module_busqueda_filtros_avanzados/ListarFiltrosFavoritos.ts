import { FiltroFavorito } from '../../../domain/entities/FiltroFavorito';
import { ListarFiltrosFavoritosUseCase } from '../../ports/in/module_busqueda_filtros_avanzados/ListarFiltrosFavoritosUseCase';
import { FiltroFavoritoRepository } from '../../ports/out/persistencia/repositorios/FiltroFavoritoRepository';

export class ListarFiltrosFavoritos implements ListarFiltrosFavoritosUseCase {
  constructor(private readonly filtroFavoritoRepository: FiltroFavoritoRepository) {}

  async ejecutar(analistaId: string): Promise<FiltroFavorito[]> {
    return this.filtroFavoritoRepository.listarPorAnalista(analistaId);
  }
}
