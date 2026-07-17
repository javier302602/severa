import jwt from 'jsonwebtoken';
import { IniciarSesion } from '../../src/application/usecases/IniciarSesion';
import { AnalistaRepository } from '../../src/application/ports/out/AnalistaRepository';
import { HasherDeContrasenas } from '../../src/application/ports/out/HasherDeContrasenas';
import { Analista } from '../../src/domain/entities/Analista';
import { Correo } from '../../src/domain/value-objects/Correo';
import { CredencialesInvalidasError } from '../../src/domain/errors/CredencialesInvalidasError';
import { CuentaBloqueadaError } from '../../src/domain/errors/CuentaBloqueadaError';

const JWT_SECRET = 'secreto-de-pruebas';

function repositorioFalso(analista: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(analista),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

function hasherFalso(resultadoComparar: boolean): HasherDeContrasenas {
  return {
    generarHash: jest.fn().mockResolvedValue('hash-irrelevante'),
    comparar: jest.fn().mockResolvedValue(resultadoComparar)
  };
}

describe('IniciarSesion', () => {
  test('login exitoso con credenciales correctas devuelve el analista y un token válido', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista', false);
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(true);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    const resultado = await usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'correcta123' });

    expect(resultado.analista).toBe(analista);
    expect(hasher.comparar).toHaveBeenCalledWith('correcta123', 'hash-real');

    const payload = jwt.verify(resultado.token, JWT_SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe('1');
    expect(payload.rol).toBe('analista');
  });

  test('lanza CredencialesInvalidasError con una contraseña incorrecta', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista', false);
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(false);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    await expect(
      usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'incorrecta' })
    ).rejects.toThrow(CredencialesInvalidasError);
  });

  test('lanza CuentaBloqueadaError si el repositorio reporta la cuenta como bloqueada', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista', true);
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(true);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    await expect(
      usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'correcta123' })
    ).rejects.toThrow(CuentaBloqueadaError);

    // El bloqueo se verifica antes de comparar la contraseña.
    expect(hasher.comparar).not.toHaveBeenCalled();
  });

  test('los primeros 4 intentos fallidos no bloquean la cuenta', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista');
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(false);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    for (let i = 0; i < 4; i++) {
      await expect(
        usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'incorrecta' })
      ).rejects.toThrow(CredencialesInvalidasError);
    }

    expect(analista.intentosFallidos).toBe(4);
    expect(analista.bloqueado).toBe(false);
  });

  test('el 5to intento fallido bloquea la cuenta, y el siguiente lanza CuentaBloqueadaError', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista');
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(false);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    for (let i = 0; i < 5; i++) {
      await expect(
        usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'incorrecta' })
      ).rejects.toThrow(CredencialesInvalidasError);
    }

    expect(analista.bloqueado).toBe(true);
    expect(analista.bloqueadoHasta).not.toBeNull();

    await expect(
      usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'cualquier-cosa' })
    ).rejects.toThrow(CuentaBloqueadaError);
  });

  test('un login exitoso resetea el contador de intentos fallidos', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista', false, 3);
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(true);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    await usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'correcta123' });

    expect(analista.intentosFallidos).toBe(0);
    expect(analista.bloqueado).toBe(false);
  });

  test('un bloqueo ya expirado (15 minutos cumplidos) permite un nuevo intento en vez de lanzar CuentaBloqueadaError', async () => {
    const bloqueadoHasta = new Date(Date.now() - 1000); // expiró hace 1 segundo
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash-real', 'analista', true, 5, bloqueadoHasta);
    const repository = repositorioFalso(analista);
    const hasher = hasherFalso(true);
    const usecase = new IniciarSesion(repository, hasher, JWT_SECRET);

    const resultado = await usecase.ejecutar({ correo: 'ana@example.com', contrasena: 'correcta123' });

    expect(resultado.analista).toBe(analista);
    expect(analista.bloqueado).toBe(false);
    expect(analista.intentosFallidos).toBe(0);
  });
});
