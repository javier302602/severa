import { RestablecerContrasena } from '../../../src/application/usecases/module_gestion_usuarios/RestablecerContrasena';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { TokenRecuperacionRepository } from '../../../src/application/ports/out/persistencia/repositorios/TokenRecuperacionRepository';
import { HasherDeContrasenas } from '../../../src/application/ports/out/seguridad/HasherDeContrasenas';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { TokenRecuperacion } from '../../../src/domain/entities/TokenRecuperacion';
import { TokenRecuperacionInvalidoError } from '../../../src/domain/errors/TokenRecuperacionInvalidoError';
import { ContrasenaInvalidaError } from '../../../src/domain/errors/ContrasenaInvalidaError';
import { hashearToken } from '../../../src/application/utils/HashearToken';

const TOKEN_PLANO = 'token-de-prueba-con-suficiente-entropia';

function analistaRepositorioFalso(analistaExistente: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analistaExistente),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

function tokenRepositorioFalso(tokenExistente: TokenRecuperacion | null): TokenRecuperacionRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorHash: jest.fn().mockResolvedValue(tokenExistente),
    invalidarVigentesDeAnalista: jest.fn().mockResolvedValue(undefined)
  };
}

function hasherFalso(): HasherDeContrasenas {
  return {
    generarHash: jest.fn().mockImplementation(async (contrasena: string) => `hash(${contrasena})`),
    comparar: jest.fn().mockResolvedValue(true)
  };
}

describe('RestablecerContrasena', () => {
  test('con un token vigente y no usado, actualiza la contraseña y marca el token como usado', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-viejo', 'analista');
    const tokenVigente = new TokenRecuperacion(
      't1',
      '1',
      hashearToken(TOKEN_PLANO),
      new Date(Date.now() + 10 * 60 * 1000)
    );
    const analistaRepository = analistaRepositorioFalso(analista);
    const tokenRepository = tokenRepositorioFalso(tokenVigente);
    const hasher = hasherFalso();
    const usecase = new RestablecerContrasena(analistaRepository, tokenRepository, hasher);

    const resultado = await usecase.ejecutar({ token: TOKEN_PLANO, nuevaContrasena: 'nuevaClave123' });

    expect(resultado).toEqual({ analistaId: '1' });
    expect(analistaRepository.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', contrasenaHash: 'hash(nuevaClave123)' })
    );
    expect(tokenRepository.guardar).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', usado: true }));
  });

  test('rechaza un token que no existe', async () => {
    const analistaRepository = analistaRepositorioFalso(null);
    const tokenRepository = tokenRepositorioFalso(null);
    const hasher = hasherFalso();
    const usecase = new RestablecerContrasena(analistaRepository, tokenRepository, hasher);

    await expect(
      usecase.ejecutar({ token: 'token-inexistente', nuevaContrasena: 'nuevaClave123' })
    ).rejects.toThrow(TokenRecuperacionInvalidoError);

    expect(analistaRepository.guardar).not.toHaveBeenCalled();
  });

  test('rechaza un token expirado', async () => {
    const tokenExpirado = new TokenRecuperacion(
      't1',
      '1',
      hashearToken(TOKEN_PLANO),
      new Date(Date.now() - 60 * 1000)
    );
    const analistaRepository = analistaRepositorioFalso(null);
    const tokenRepository = tokenRepositorioFalso(tokenExpirado);
    const hasher = hasherFalso();
    const usecase = new RestablecerContrasena(analistaRepository, tokenRepository, hasher);

    await expect(usecase.ejecutar({ token: TOKEN_PLANO, nuevaContrasena: 'nuevaClave123' })).rejects.toThrow(
      TokenRecuperacionInvalidoError
    );

    expect(analistaRepository.guardar).not.toHaveBeenCalled();
  });

  test('rechaza un token ya usado', async () => {
    const tokenUsado = new TokenRecuperacion(
      't1',
      '1',
      hashearToken(TOKEN_PLANO),
      new Date(Date.now() + 10 * 60 * 1000),
      true
    );
    const analistaRepository = analistaRepositorioFalso(null);
    const tokenRepository = tokenRepositorioFalso(tokenUsado);
    const hasher = hasherFalso();
    const usecase = new RestablecerContrasena(analistaRepository, tokenRepository, hasher);

    await expect(usecase.ejecutar({ token: TOKEN_PLANO, nuevaContrasena: 'nuevaClave123' })).rejects.toThrow(
      TokenRecuperacionInvalidoError
    );

    expect(analistaRepository.guardar).not.toHaveBeenCalled();
  });

  test('rechaza una contraseña nueva con menos de 8 caracteres, sin siquiera consultar el token', async () => {
    const analistaRepository = analistaRepositorioFalso(null);
    const tokenRepository = tokenRepositorioFalso(null);
    const hasher = hasherFalso();
    const usecase = new RestablecerContrasena(analistaRepository, tokenRepository, hasher);

    await expect(usecase.ejecutar({ token: TOKEN_PLANO, nuevaContrasena: 'corta1' })).rejects.toThrow(
      ContrasenaInvalidaError
    );

    expect(tokenRepository.buscarPorHash).not.toHaveBeenCalled();
    expect(analistaRepository.guardar).not.toHaveBeenCalled();
  });
});
