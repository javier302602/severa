import { IniciarSesionConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/IniciarSesionConAuditoria';
import { IniciarSesionUseCase } from '../../../../src/application/ports/in/module_gestion_usuarios/IniciarSesionUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Analista } from '../../../../src/domain/entities/Analista';
import { Correo } from '../../../../src/domain/shared/value-objects/Correo';
import { CredencialesInvalidasError } from '../../../../src/domain/errors/CredencialesInvalidasError';
import { CuentaBloqueadaError } from '../../../../src/domain/errors/CuentaBloqueadaError';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('IniciarSesionConAuditoria', () => {
  test('registra un evento "Login" con la IP cuando el login es exitoso', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const iniciarSesion: IniciarSesionUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ analista, token: 'jwt-token' })
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new IniciarSesionConAuditoria(iniciarSesion, auditoriaRepository);

    const resultado = await decorator.ejecutar({ correo: 'ana@example.com', contrasena: 'secreta123' }, '203.0.113.5');

    expect(resultado.token).toBe('jwt-token');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: '1', accion: 'Login', ip: '203.0.113.5' })
    );
  });

  test('registra "LoginFallido" con el correo intentado y la IP cuando las credenciales son inválidas, y propaga el error', async () => {
    const iniciarSesion: IniciarSesionUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new CredencialesInvalidasError())
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new IniciarSesionConAuditoria(iniciarSesion, auditoriaRepository);

    await expect(
      decorator.ejecutar({ correo: 'ana@example.com', contrasena: 'incorrecta' }, '203.0.113.5')
    ).rejects.toThrow(CredencialesInvalidasError);

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'ana@example.com', accion: 'LoginFallido', ip: '203.0.113.5' })
    );
  });

  // RF-06 + RF-08: un intento sobre una cuenta bloqueada es un tipo de error
  // distinto (CuentaBloqueadaError, no CredencialesInvalidasError) — debe
  // quedar auditado igual que cualquier otro login fallido, no solo el caso
  // de contraseña incorrecta/correo inexistente.
  test('registra "LoginFallido" cuando la cuenta está bloqueada (CuentaBloqueadaError), y propaga el error', async () => {
    const iniciarSesion: IniciarSesionUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new CuentaBloqueadaError())
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new IniciarSesionConAuditoria(iniciarSesion, auditoriaRepository);

    await expect(
      decorator.ejecutar({ correo: 'bloqueada@example.com', contrasena: 'cualquiera' }, '203.0.113.5')
    ).rejects.toThrow(CuentaBloqueadaError);

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'bloqueada@example.com', accion: 'LoginFallido', ip: '203.0.113.5' })
    );
  });

  test('si se invoca sin IP (contexto no-HTTP), registra ip: null sin fallar', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const iniciarSesion: IniciarSesionUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ analista, token: 'jwt-token' })
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new IniciarSesionConAuditoria(iniciarSesion, auditoriaRepository);

    await decorator.ejecutar({ correo: 'ana@example.com', contrasena: 'secreta123' });

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(expect.objectContaining({ ip: null }));
  });
});
