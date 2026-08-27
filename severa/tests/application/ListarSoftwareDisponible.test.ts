import { ListarSoftwareDisponible } from '../../src/application/usecases/ListarSoftwareDisponible';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';

function repositorioFalso(listarSoftwareDisponible: jest.Mock): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn(),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarPorSoftware: jest.fn(),
    listarSoftwareDisponible,
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

// Bug real reportado: comparar "Apache Log4j" vs "Nginx" a mano decía "sin
// datos" para ambos si el catálogo real tenía esos nombres escritos
// distinto — este usecase alimenta el dropdown con los valores REALES del
// catálogo del analista.
describe('ListarSoftwareDisponible', () => {
  test('pasa el analistaId dueño y devuelve la lista tal cual', async () => {
    const listarSoftwareDisponible = jest.fn().mockResolvedValue(['Apache Log4j', 'OpenSSL', 'nginx']);
    const usecase = new ListarSoftwareDisponible(repositorioFalso(listarSoftwareDisponible));

    const resultado = await usecase.ejecutar('analista-A');

    expect(resultado).toEqual(['Apache Log4j', 'OpenSSL', 'nginx']);
    expect(listarSoftwareDisponible).toHaveBeenCalledWith('analista-A');
  });

  test('catálogo vacío devuelve lista vacía, no error', async () => {
    const listarSoftwareDisponible = jest.fn().mockResolvedValue([]);
    const usecase = new ListarSoftwareDisponible(repositorioFalso(listarSoftwareDisponible));

    const resultado = await usecase.ejecutar('analista-A');

    expect(resultado).toEqual([]);
  });
});
