import { RecuperarContrasenaConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/RecuperarContrasenaConAuditoria';
import { RecuperarContrasenaUseCase } from '../../../../src/application/ports/in/module_gestion_usuarios/RecuperarContrasenaUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('RecuperarContrasenaConAuditoria', () => {
  test('registra en auditoría cuando el correo corresponde a una cuenta real', async () => {
    const usecase: RecuperarContrasenaUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ analistaId: '1' })
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new RecuperarContrasenaConAuditoria(usecase, auditoriaRepository);

    const resultado = await decorator.ejecutar({ correo: 'ana@example.com' });

    expect(resultado).toEqual({ analistaId: '1' });
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: '1', accion: 'SolicitudRecuperacionContrasena' })
    );
  });

  test('NO registra nada si el correo no corresponde a ninguna cuenta', async () => {
    const usecase: RecuperarContrasenaUseCase = {
      ejecutar: jest.fn().mockResolvedValue(null)
    };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new RecuperarContrasenaConAuditoria(usecase, auditoriaRepository);

    const resultado = await decorator.ejecutar({ correo: 'no-existe@example.com' });

    expect(resultado).toBeNull();
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
