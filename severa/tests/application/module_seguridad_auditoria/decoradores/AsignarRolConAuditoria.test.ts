import { AsignarRolConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/AsignarRolConAuditoria';
import { AsignarRolUseCase } from '../../../../src/application/ports/in/module_gestion_usuarios/AsignarRolUseCase';
import { AnalistaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Analista } from '../../../../src/domain/entities/Analista';
import { Correo } from '../../../../src/domain/shared/value-objects/Correo';
import { RolInvalidoError } from '../../../../src/domain/errors/RolInvalidoError';

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

describe('AsignarRolConAuditoria', () => {
  test('registra en auditoría el rol anterior, el rol nuevo y quién hizo el cambio', async () => {
    const analistaAntes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(analistaAntes);
    const auditoriaRepository = auditoriaFalsa();

    const analistaDespues = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'administrador');
    const usecase: AsignarRolUseCase = {
      ejecutar: jest.fn().mockResolvedValue(analistaDespues)
    };

    const decorator = new AsignarRolConAuditoria(usecase, analistaRepository, auditoriaRepository);

    const resultado = await decorator.ejecutar({ analistaId: '1', nuevoRol: 'administrador' }, 'admin-1');

    expect(resultado.rol).toBe('administrador');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario: 'admin-1',
        accion: 'AsignacionDeRol',
        detalle: expect.stringContaining("'analista' a 'administrador'")
      })
    );
  });

  test('NO registra nada si la asignación falla (propaga el error tal cual)', async () => {
    const analistaAntes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(analistaAntes);
    const auditoriaRepository = auditoriaFalsa();

    const usecase: AsignarRolUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new RolInvalidoError('superadmin'))
    };

    const decorator = new AsignarRolConAuditoria(usecase, analistaRepository, auditoriaRepository);

    await expect(
      decorator.ejecutar({ analistaId: '1', nuevoRol: 'superadmin' as never }, 'admin-1')
    ).rejects.toThrow(RolInvalidoError);

    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
