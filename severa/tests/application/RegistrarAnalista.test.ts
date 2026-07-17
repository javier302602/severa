import { RegistrarAnalista } from '../../src/application/usecases/RegistrarAnalista';
import { AnalistaRepository } from '../../src/application/ports/out/AnalistaRepository';
import { HasherDeContrasenas } from '../../src/application/ports/out/HasherDeContrasenas';
import { Analista } from '../../src/domain/entities/Analista';
import { Correo } from '../../src/domain/value-objects/Correo';
import { CorreoInvalidoError } from '../../src/domain/errors/CorreoInvalidoError';
import { CorreoYaRegistradoError } from '../../src/domain/errors/CorreoYaRegistradoError';

function repositorioFalso(analistaExistente: Analista | null = null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(analistaExistente),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

function hasherFalso(): HasherDeContrasenas {
  return {
    generarHash: jest.fn().mockImplementation(async (contrasena: string) => `hash(${contrasena})`),
    comparar: jest.fn().mockResolvedValue(true)
  };
}

describe('RegistrarAnalista', () => {
  test('llama a hash() antes de guardar el analista', async () => {
    const llamadas: string[] = [];
    const repository = repositorioFalso();
    const hasher = hasherFalso();
    (hasher.generarHash as jest.Mock).mockImplementation(async (contrasena: string) => {
      llamadas.push('hash');
      return `hash(${contrasena})`;
    });
    (repository.guardar as jest.Mock).mockImplementation(async () => {
      llamadas.push('guardar');
    });

    const usecase = new RegistrarAnalista(repository, hasher);
    await usecase.ejecutar({
      id: '1',
      nombre: 'Ana',
      correo: 'ana@example.com',
      contrasena: 'secreta123'
    });

    expect(llamadas).toEqual(['hash', 'guardar']);
    expect(hasher.generarHash).toHaveBeenCalledWith('secreta123');
    expect(repository.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ contrasenaHash: 'hash(secreta123)' })
    );
  });

  test('rechaza un correo con formato inválido', async () => {
    const repository = repositorioFalso();
    const hasher = hasherFalso();
    const usecase = new RegistrarAnalista(repository, hasher);

    await expect(
      usecase.ejecutar({
        id: '1',
        nombre: 'Ana',
        correo: 'esto-no-es-un-correo',
        contrasena: 'secreta123'
      })
    ).rejects.toThrow(CorreoInvalidoError);

    expect(hasher.generarHash).not.toHaveBeenCalled();
    expect(repository.guardar).not.toHaveBeenCalled();
  });

  test('rechaza un registro duplicado si el repositorio ya tiene ese correo', async () => {
    const existente = new Analista('0', 'Otro', new Correo('ana@example.com'), 'hash-existente', 'analista');
    const repository = repositorioFalso(existente);
    const hasher = hasherFalso();
    const usecase = new RegistrarAnalista(repository, hasher);

    await expect(
      usecase.ejecutar({
        id: '1',
        nombre: 'Ana',
        correo: 'ana@example.com',
        contrasena: 'secreta123'
      })
    ).rejects.toThrow(CorreoYaRegistradoError);

    expect(hasher.generarHash).not.toHaveBeenCalled();
    expect(repository.guardar).not.toHaveBeenCalled();
  });

  // RF-04 (Sprint 15): la interfaz de entrada ya ni siquiera acepta `rol`
  // (ver RegistrarAnalistaUseCase.ts) — este test documenta, a nivel de
  // caso de uso, que el analista creado siempre queda con rol 'analista'.
  // El intento real de ataque (mandar rol en el JSON del body HTTP, que no
  // pasa por el tipo de TypeScript) se prueba en
  // tests/infrastructure/AuthController.test.ts.
  test('siempre crea el analista con rol "analista"', async () => {
    const repository = repositorioFalso();
    const hasher = hasherFalso();
    const usecase = new RegistrarAnalista(repository, hasher);

    const analista = await usecase.ejecutar({
      id: '1',
      nombre: 'Ana',
      correo: 'ana@example.com',
      contrasena: 'secreta123'
    });

    expect(analista.rol).toBe('analista');
  });
});
