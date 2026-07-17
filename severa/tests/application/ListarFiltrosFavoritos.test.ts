import { ListarFiltrosFavoritos } from '../../src/application/usecases/ListarFiltrosFavoritos';
import { FiltroFavoritoRepository } from '../../src/application/ports/out/FiltroFavoritoRepository';
import { FiltroFavorito } from '../../src/domain/entities/FiltroFavorito';

function repositorioFalso(favoritos: FiltroFavorito[]): FiltroFavoritoRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    listarPorAnalista: jest.fn().mockResolvedValue(favoritos)
  };
}

describe('ListarFiltrosFavoritos', () => {
  test('llama al repositorio con el analistaId correcto y devuelve sus favoritos', async () => {
    const favoritos = [
      new FiltroFavorito('f1', 'analista-1', 'Críticos de Log4j', { cvssMin: 9.0, componente: 'Apache Log4j' })
    ];
    const repository = repositorioFalso(favoritos);
    const usecase = new ListarFiltrosFavoritos(repository);

    const resultado = await usecase.ejecutar('analista-1');

    expect(repository.listarPorAnalista).toHaveBeenCalledWith('analista-1');
    expect(resultado).toBe(favoritos);
  });
});
