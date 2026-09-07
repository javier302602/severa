import { ExportarDatasetGenerico } from '../../../src/application/usecases/module_carga_gestion_datasets/ExportarDatasetGenerico';
import { DatasetGenericoRepository } from '../../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../../src/domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../src/domain/entities/RegistroDatasetGenerico';
import { DatasetGenericoNoEncontradoError } from '../../../src/domain/errors/DatasetGenericoNoEncontradoError';

function repositorioFalso(dataset: DatasetGenerico | null, registros: RegistroDatasetGenerico[] = []): DatasetGenericoRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarRegistros: jest.fn().mockResolvedValue(undefined),
    buscarPorId: jest.fn().mockResolvedValue(dataset),
    listarRegistros: jest.fn().mockResolvedValue(registros)
  };
}

describe('ExportarDatasetGenerico', () => {
  test('exporta el dataset propio con sus registros', async () => {
    const dataset = new DatasetGenerico('d1', 'analista-A', 'ventas.xlsx', ['Producto', 'Precio'], 'archivo', null, 0);
    const registros = [
      new RegistroDatasetGenerico('r1', 'd1', 'analista-A', { Producto: 'Laptop', Precio: 1200 }),
      new RegistroDatasetGenerico('r2', 'd1', 'analista-A', { Producto: 'Mouse', Precio: 25 })
    ];
    const repository = repositorioFalso(dataset, registros);
    const usecase = new ExportarDatasetGenerico(repository);

    const buffer = await usecase.ejecutar('d1', 'analista-A');

    expect(repository.buscarPorId).toHaveBeenCalledWith('d1', 'analista-A');
    expect(repository.listarRegistros).toHaveBeenCalledWith('d1', 'analista-A');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('lanza DatasetGenericoNoEncontradoError si el dataset no existe', async () => {
    const repository = repositorioFalso(null);
    const usecase = new ExportarDatasetGenerico(repository);

    await expect(usecase.ejecutar('no-existe', 'analista-A')).rejects.toThrow(DatasetGenericoNoEncontradoError);
    expect(repository.listarRegistros).not.toHaveBeenCalled();
  });

  test('lanza el mismo error si el dataset pertenece a otro analista (buscarPorId ya scopea, undefined en ambos casos)', async () => {
    // buscarPorId(id, analistaId) ya filtra por dueño en el repositorio real —
    // acá simulamos exactamente lo que devuelve cuando el dataset es de otro:
    // null, indistinguible de "no existe".
    const repository = repositorioFalso(null);
    const usecase = new ExportarDatasetGenerico(repository);

    await expect(usecase.ejecutar('dataset-de-otro', 'analista-B')).rejects.toThrow(DatasetGenericoNoEncontradoError);
  });
});
