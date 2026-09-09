import { AsignarRol } from '../../../src/application/usecases/module_gestion_usuarios/AsignarRol';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { RolInvalidoError } from '../../../src/domain/errors/RolInvalidoError';

function repositorioFalso(analistaExistente: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analistaExistente),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue([])
  };
}

describe('AsignarRol', () => {
  test('asigna un rol válido y persiste el cambio', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const repository = repositorioFalso(analista);
    const usecase = new AsignarRol(repository);

    const resultado = await usecase.ejecutar({ analistaId: '1', nuevoRol: 'administrador' });

    expect(resultado.rol).toBe('administrador');
    expect(repository.guardar).toHaveBeenCalledWith(expect.objectContaining({ id: '1', rol: 'administrador' }));
  });

  test('rechaza un rol que no existe en el dominio', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const repository = repositorioFalso(analista);
    const usecase = new AsignarRol(repository);

    await expect(
      usecase.ejecutar({ analistaId: '1', nuevoRol: 'superadmin' as never })
    ).rejects.toThrow(RolInvalidoError);

    expect(repository.guardar).not.toHaveBeenCalled();
  });

  test('rechaza la asignación si el analista no existe', async () => {
    const repository = repositorioFalso(null);
    const usecase = new AsignarRol(repository);

    await expect(usecase.ejecutar({ analistaId: 'no-existe', nuevoRol: 'administrador' })).rejects.toThrow(
      'Analista no encontrado'
    );

    expect(repository.guardar).not.toHaveBeenCalled();
  });
});
