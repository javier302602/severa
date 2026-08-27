import { ReiniciarDataset } from '../../src/application/usecases/ReiniciarDataset';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';

function repoFalso(eliminados: number): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(eliminados)
  };
}

describe('ReiniciarDataset', () => {
  test('delega en eliminarTodas() del repositorio y devuelve cuántos registros se eliminaron', async () => {
    const repo = repoFalso(150);
    const usecase = new ReiniciarDataset(repo);

    const resultado = await usecase.ejecutar('analista-1');

    expect(repo.eliminarTodas).toHaveBeenCalledWith('analista-1');
    expect(resultado).toEqual({ eliminados: 150 });
  });

  test('con el catálogo ya vacío, devuelve eliminados: 0 sin romper', async () => {
    const usecase = new ReiniciarDataset(repoFalso(0));

    const resultado = await usecase.ejecutar('analista-1');

    expect(resultado).toEqual({ eliminados: 0 });
  });
});
