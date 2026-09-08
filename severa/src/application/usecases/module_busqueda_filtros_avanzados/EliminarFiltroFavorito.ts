import { EliminarFiltroFavoritoUseCase } from '../../ports/in/module_busqueda_filtros_avanzados/EliminarFiltroFavoritoUseCase';
import { FiltroFavoritoRepository } from '../../ports/out/persistencia/repositorios/FiltroFavoritoRepository';

export class EliminarFiltroFavorito implements EliminarFiltroFavoritoUseCase {
  constructor(private readonly filtroFavoritoRepository: FiltroFavoritoRepository) {}

  async ejecutar(id: string, analistaId: string): Promise<boolean> {
    return this.filtroFavoritoRepository.eliminar(id, analistaId);
  }
}
