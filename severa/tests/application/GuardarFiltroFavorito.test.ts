import { GuardarFiltroFavorito } from '../../src/application/usecases/GuardarFiltroFavorito';
import { FiltroFavoritoRepository } from '../../src/application/ports/out/FiltroFavoritoRepository';
import { FiltroFavorito } from '../../src/domain/entities/FiltroFavorito';

function repositorioFalso(): FiltroFavoritoRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    listarPorAnalista: jest.fn().mockResolvedValue([])
  };
}

describe('GuardarFiltroFavorito', () => {
  test('genera un id, arma el FiltroFavorito y lo persiste vía el repositorio', async () => {
    const repository = repositorioFalso();
    const usecase = new GuardarFiltroFavorito(repository);
    const criterios = { cvssMin: 9.0, severidad: 'Crítica', componente: 'Apache Log4j' };

    const resultado = await usecase.ejecutar({ analistaId: 'analista-1', nombre: 'Críticos de Log4j', criterios });

    expect(repository.guardar).toHaveBeenCalledTimes(1);
    const guardado = (repository.guardar as jest.Mock).mock.calls[0][0] as FiltroFavorito;

    expect(guardado).toBeInstanceOf(FiltroFavorito);
    expect(guardado.analistaId).toBe('analista-1');
    expect(guardado.nombre).toBe('Críticos de Log4j');
    expect(guardado.criterios).toEqual(criterios);
    expect(typeof guardado.id).toBe('string');
    expect(guardado.id.length).toBeGreaterThan(0);

    expect(resultado).toBe(guardado);
  });
});
