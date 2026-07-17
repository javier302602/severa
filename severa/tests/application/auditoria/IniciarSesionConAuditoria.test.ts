import { IniciarSesionConAuditoria } from '../../../src/application/usecases/auditoria/IniciarSesionConAuditoria';
import { IniciarSesionUseCase } from '../../../src/application/ports/in/IniciarSesionUseCase';
import { AuditoriaRepository } from '../../../src/application/ports/out/AuditoriaRepository';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/value-objects/Correo';
import { CredencialesInvalidasError } from '../../../src/domain/errors/CredencialesInvalidasError';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('IniciarSesionConAuditoria', () => {
  test('registra un evento de auditoría cuando el login es exitoso', async () => {
    const analista = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const iniciarSesion: IniciarSesionUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ analista, token: 'jwt-token' })
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new IniciarSesionConAuditoria(iniciarSesion, auditoriaRepository);

    const resultado = await decorator.ejecutar({ correo: 'ana@example.com', contrasena: 'secreta123' });

    expect(resultado.token).toBe('jwt-token');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: '1', accion: 'Login' })
    );
  });

  test('NO registra nada si el login falla (propaga el error tal cual)', async () => {
    const iniciarSesion: IniciarSesionUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new CredencialesInvalidasError())
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new IniciarSesionConAuditoria(iniciarSesion, auditoriaRepository);

    await expect(
      decorator.ejecutar({ correo: 'ana@example.com', contrasena: 'incorrecta' })
    ).rejects.toThrow(CredencialesInvalidasError);

    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
