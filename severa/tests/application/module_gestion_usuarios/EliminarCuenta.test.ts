import { EliminarCuenta } from '../../../src/application/usecases/module_gestion_usuarios/EliminarCuenta';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { HasherDeContrasenas } from '../../../src/application/ports/out/seguridad/HasherDeContrasenas';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { CredencialesInvalidasError } from '../../../src/domain/errors/CredencialesInvalidasError';

function repositorioFalso(analista: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analista),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

function hasherFalso(compararResultado: boolean): HasherDeContrasenas {
  return {
    generarHash: jest.fn().mockResolvedValue('hash'),
    comparar: jest.fn().mockResolvedValue(compararResultado)
  };
}

describe('EliminarCuenta', () => {
  test('elimina la cuenta cuando la contraseña es correcta', async () => {
    const analista = new Analista('analista-42', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista');
    const analistaRepository = repositorioFalso(analista);
    const hasher = hasherFalso(true);

    const usecase = new EliminarCuenta(analistaRepository, hasher);
    await usecase.ejecutar('analista-42', 'ClaveCorrecta123');

    expect(hasher.comparar).toHaveBeenCalledWith('ClaveCorrecta123', 'hash-real');
    expect(analistaRepository.eliminar).toHaveBeenCalledWith('analista-42');
  });

  test('rechaza y NO elimina la cuenta cuando la contraseña es incorrecta', async () => {
    const analista = new Analista('analista-42', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista');
    const analistaRepository = repositorioFalso(analista);
    const hasher = hasherFalso(false);

    const usecase = new EliminarCuenta(analistaRepository, hasher);

    await expect(usecase.ejecutar('analista-42', 'ClaveIncorrecta')).rejects.toThrow(CredencialesInvalidasError);
    expect(analistaRepository.eliminar).not.toHaveBeenCalled();
  });

  test('lanza error si el analista no existe', async () => {
    const analistaRepository = repositorioFalso(null);
    const hasher = hasherFalso(true);

    const usecase = new EliminarCuenta(analistaRepository, hasher);

    await expect(usecase.ejecutar('no-existe', 'cualquiera')).rejects.toThrow('Analista no encontrado');
    expect(analistaRepository.eliminar).not.toHaveBeenCalled();
  });
});
