import { RestablecerContrasenaConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/RestablecerContrasenaConAuditoria';
import { RestablecerContrasenaUseCase } from '../../../../src/application/ports/in/module_gestion_usuarios/RestablecerContrasenaUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { TokenRecuperacionInvalidoError } from '../../../../src/domain/errors/TokenRecuperacionInvalidoError';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('RestablecerContrasenaConAuditoria', () => {
  test('registra en auditoría cuando el restablecimiento tiene éxito', async () => {
    const usecase: RestablecerContrasenaUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ analistaId: '1' })
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new RestablecerContrasenaConAuditoria(usecase, auditoriaRepository);

    const resultado = await decorator.ejecutar({ token: 'token', nuevaContrasena: 'nuevaClave123' });

    expect(resultado).toEqual({ analistaId: '1' });
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: '1', accion: 'RestablecimientoContrasena' })
    );
  });

  test('NO registra nada si el restablecimiento falla (propaga el error tal cual)', async () => {
    const usecase: RestablecerContrasenaUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new TokenRecuperacionInvalidoError())
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new RestablecerContrasenaConAuditoria(usecase, auditoriaRepository);

    await expect(
      decorator.ejecutar({ token: 'token-invalido', nuevaContrasena: 'nuevaClave123' })
    ).rejects.toThrow(TokenRecuperacionInvalidoError);

    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
