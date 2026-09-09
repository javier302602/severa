import { EditarPerfil } from '../../../src/application/usecases/module_perfil_analista/EditarPerfil';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { CorreoYaRegistradoError } from '../../../src/domain/errors/CorreoYaRegistradoError';

function repositorioFalso(analistas: Analista[]): AnalistaRepository {
  const porId = new Map(analistas.map((analista) => [analista.id, analista]));
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn(async (correo: string) => analistas.find((a) => a.correo.valor === correo) ?? null),
    buscarPorId: jest.fn(async (id: string) => porId.get(id) ?? null),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue([])
  };
}

describe('EditarPerfil', () => {
  test('edita el nombre exitosamente', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const repository = repositorioFalso([analista]);
    const usecase = new EditarPerfil(repository);

    const resultado = await usecase.ejecutar({ id: '1', nombre: 'Ana Torres', correo: 'ana@example.com' });

    expect(resultado.nombre).toBe('Ana Torres');
    expect(repository.guardar).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Ana Torres' }));
  });

  test('edita el correo a uno libre exitosamente', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const repository = repositorioFalso([analista]);
    const usecase = new EditarPerfil(repository);

    const resultado = await usecase.ejecutar({ id: '1', nombre: 'Ana', correo: 'ana.nueva@example.com' });

    expect(resultado.correo.valor).toBe('ana.nueva@example.com');
    expect(repository.guardar).toHaveBeenCalledWith(expect.objectContaining({ correo: expect.objectContaining({ valor: 'ana.nueva@example.com' }) }));
  });

  test('rechaza el cambio de correo si ya está registrado por OTRO analista', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const otro = new Analista('2', 'Beto', new Correo('beto@example.com'), 'hash', 'analista');
    const repository = repositorioFalso([analista, otro]);
    const usecase = new EditarPerfil(repository);

    await expect(
      usecase.ejecutar({ id: '1', nombre: 'Ana', correo: 'beto@example.com' })
    ).rejects.toThrow(CorreoYaRegistradoError);

    expect(repository.guardar).not.toHaveBeenCalled();
  });

  test('no rechaza cuando el analista reenvía su propio correo sin cambiarlo', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const repository = repositorioFalso([analista]);
    const usecase = new EditarPerfil(repository);

    const resultado = await usecase.ejecutar({ id: '1', nombre: 'Ana Torres', correo: 'ana@example.com' });

    expect(resultado.correo.valor).toBe('ana@example.com');
    expect(repository.guardar).toHaveBeenCalled();
  });

  test('lanza error si el analista no existe', async () => {
    const repository = repositorioFalso([]);
    const usecase = new EditarPerfil(repository);

    await expect(
      usecase.ejecutar({ id: 'no-existe', nombre: 'Ana', correo: 'ana@example.com' })
    ).rejects.toThrow('Analista no encontrado');
  });
});
