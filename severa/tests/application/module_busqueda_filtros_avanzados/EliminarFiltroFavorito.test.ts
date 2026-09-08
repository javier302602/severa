import { EliminarFiltroFavorito } from '../../../src/application/usecases/module_busqueda_filtros_avanzados/EliminarFiltroFavorito';
import { FiltroFavoritoRepository } from '../../../src/application/ports/out/persistencia/repositorios/FiltroFavoritoRepository';

function repositorioFalso(existe: boolean): FiltroFavoritoRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    listarPorAnalista: jest.fn().mockResolvedValue([]),
    eliminar: jest.fn().mockResolvedValue(existe)
  };
}

describe('EliminarFiltroFavorito', () => {
  test('delega en el repositorio con id y analistaId, devuelve true si existía y era del analista', async () => {
    const repository = repositorioFalso(true);
    const usecase = new EliminarFiltroFavorito(repository);

    const resultado = await usecase.ejecutar('f1', 'analista-1');

    expect(repository.eliminar).toHaveBeenCalledWith('f1', 'analista-1');
    expect(resultado).toBe(true);
  });

  test('devuelve false si el repositorio indica que no existía o era de otro analista', async () => {
    const repository = repositorioFalso(false);
    const usecase = new EliminarFiltroFavorito(repository);

    const resultado = await usecase.ejecutar('f-ajeno', 'analista-1');

    expect(resultado).toBe(false);
  });
});
