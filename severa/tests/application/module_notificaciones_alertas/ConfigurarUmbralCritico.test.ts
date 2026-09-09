import { ConfigurarUmbralCritico } from '../../../src/application/usecases/module_notificaciones_alertas/ConfigurarUmbralCritico';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { VariableDeConsultaInvalidaError } from '../../../src/domain/errors/VariableDeConsultaInvalidaError';

function analistaRepositoryFalso(): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue([])
  };
}

describe('ConfigurarUmbralCritico', () => {
  test('con variable numérica válida, persiste variable y valor', async () => {
    const analistaRepository = analistaRepositoryFalso();
    const usecase = new ConfigurarUmbralCritico(analistaRepository);

    await usecase.ejecutar('analista-1', 'diasParaParche', 30);

    expect(analistaRepository.actualizarUmbralCritico).toHaveBeenCalledWith('analista-1', 'diasParaParche', 30);
  });

  test('rechaza una variable que no es numérica válida (ej. severidad, que es categórica)', async () => {
    const analistaRepository = analistaRepositoryFalso();
    const usecase = new ConfigurarUmbralCritico(analistaRepository);

    await expect(usecase.ejecutar('analista-1', 'severidad', 5)).rejects.toThrow(VariableDeConsultaInvalidaError);
    expect(analistaRepository.actualizarUmbralCritico).not.toHaveBeenCalled();
  });

  test('rechaza un valor no finito (NaN)', async () => {
    const analistaRepository = analistaRepositoryFalso();
    const usecase = new ConfigurarUmbralCritico(analistaRepository);

    await expect(usecase.ejecutar('analista-1', 'cvssScore', NaN)).rejects.toThrow(VariableDeConsultaInvalidaError);
    expect(analistaRepository.actualizarUmbralCritico).not.toHaveBeenCalled();
  });
});
