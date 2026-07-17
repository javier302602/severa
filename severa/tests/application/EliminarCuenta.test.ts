import { EliminarCuenta } from '../../src/application/usecases/EliminarCuenta';
import { AnalistaRepository } from '../../src/application/ports/out/AnalistaRepository';

describe('EliminarCuenta', () => {
  test('elimina la cuenta con el id dado a través del repositorio', async () => {
    const analistaRepository: AnalistaRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
      buscarPorCorreo: jest.fn().mockResolvedValue(null),
      buscarPorId: jest.fn().mockResolvedValue(null),
      eliminar: jest.fn().mockResolvedValue(undefined)
    };

    const usecase = new EliminarCuenta(analistaRepository);
    await usecase.ejecutar('analista-42');

    expect(analistaRepository.eliminar).toHaveBeenCalledWith('analista-42');
  });
});
