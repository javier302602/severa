import { EliminarCuentaConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/EliminarCuentaConAuditoria';
import { EliminarCuentaUseCase } from '../../../../src/application/ports/in/module_gestion_usuarios/EliminarCuentaUseCase';
import { AnalistaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Analista } from '../../../../src/domain/entities/Analista';
import { Correo } from '../../../../src/domain/shared/value-objects/Correo';
import { CredencialesInvalidasError } from '../../../../src/domain/errors/CredencialesInvalidasError';

function analistaRepositorioFalso(analistaAntes: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analistaAntes),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };
}

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('EliminarCuentaConAuditoria', () => {
  test('registra en auditoría el correo de la cuenta eliminada, leído antes del borrado', async () => {
    const analistaAntes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(analistaAntes);
    const auditoriaRepository = auditoriaFalsa();

    const usecase: EliminarCuentaUseCase = { ejecutar: jest.fn().mockResolvedValue(undefined) };
    const decorator = new EliminarCuentaConAuditoria(usecase, analistaRepository, auditoriaRepository);

    await decorator.ejecutar('1', 'ClaveCorrecta123');

    expect(usecase.ejecutar).toHaveBeenCalledWith('1', 'ClaveCorrecta123');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario: '1',
        accion: 'EliminacionDeCuenta',
        detalle: expect.stringContaining('ana@example.com')
      })
    );
  });

  test('NO registra nada si la eliminación falla por contraseña incorrecta (propaga el error tal cual)', async () => {
    const analistaAntes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(analistaAntes);
    const auditoriaRepository = auditoriaFalsa();

    const usecase: EliminarCuentaUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new CredencialesInvalidasError())
    };
    const decorator = new EliminarCuentaConAuditoria(usecase, analistaRepository, auditoriaRepository);

    await expect(decorator.ejecutar('1', 'ClaveIncorrecta')).rejects.toThrow(CredencialesInvalidasError);
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
