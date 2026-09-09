import { EditarPerfilConAuditoriaYNotificacion } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/EditarPerfilConAuditoriaYNotificacion';
import { EditarPerfilUseCase } from '../../../../src/application/ports/in/module_perfil_analista/EditarPerfilUseCase';
import { AnalistaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { Analista } from '../../../../src/domain/entities/Analista';
import { Correo } from '../../../../src/domain/shared/value-objects/Correo';
import { CorreoYaRegistradoError } from '../../../../src/domain/errors/CorreoYaRegistradoError';

function analistaRepositorioFalso(analistaAntes: Analista | null): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analistaAntes),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue([])
  };
}

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

function servicioDeNotificacionesFalso(): ServicioDeNotificaciones {
  return {
    notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
    notificarPlazoProximoAVencer: jest.fn().mockResolvedValue(undefined),
    notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined),
    notificarInformeListo: jest.fn().mockResolvedValue(undefined),
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarPerfilActualizado: jest.fn().mockResolvedValue(undefined)
  };
}

describe('EditarPerfilConAuditoriaYNotificacion', () => {
  test('cuando solo cambia el correo, audita Y notifica solo ese campo', async () => {
    const antes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(antes);
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();

    const despues = new Analista('1', 'Ana', new Correo('ana.nueva@example.com'), 'hash', 'analista');
    const usecase: EditarPerfilUseCase = { ejecutar: jest.fn().mockResolvedValue(despues) };

    const decorator = new EditarPerfilConAuditoriaYNotificacion(usecase, analistaRepository, auditoriaRepository, servicioDeNotificaciones);
    const resultado = await decorator.ejecutar({ id: '1', nombre: 'Ana', correo: 'ana.nueva@example.com' });

    expect(resultado).toBe(despues);
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: '1', accion: 'EdicionDePerfil', detalle: expect.stringContaining('correo') })
    );
    expect(auditoriaRepository.registrar).not.toHaveBeenCalledWith(expect.objectContaining({ detalle: expect.stringContaining('nombre') }));
    expect(servicioDeNotificaciones.notificarPerfilActualizado).toHaveBeenCalledWith('1', ['correo']);
  });

  test('cuando cambian nombre y correo, audita Y notifica ambos campos', async () => {
    const antes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(antes);
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();

    const despues = new Analista('1', 'Ana Torres', new Correo('ana.nueva@example.com'), 'hash', 'analista');
    const usecase: EditarPerfilUseCase = { ejecutar: jest.fn().mockResolvedValue(despues) };

    const decorator = new EditarPerfilConAuditoriaYNotificacion(usecase, analistaRepository, auditoriaRepository, servicioDeNotificaciones);
    await decorator.ejecutar({ id: '1', nombre: 'Ana Torres', correo: 'ana.nueva@example.com' });

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: expect.stringContaining('nombre y correo') })
    );
    expect(servicioDeNotificaciones.notificarPerfilActualizado).toHaveBeenCalledWith('1', ['nombre', 'correo']);
  });

  test('sin cambios reales (mismo nombre y correo), NO audita ni notifica', async () => {
    const antes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(antes);
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();

    const despues = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const usecase: EditarPerfilUseCase = { ejecutar: jest.fn().mockResolvedValue(despues) };

    const decorator = new EditarPerfilConAuditoriaYNotificacion(usecase, analistaRepository, auditoriaRepository, servicioDeNotificaciones);
    await decorator.ejecutar({ id: '1', nombre: 'Ana', correo: 'ana@example.com' });

    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarPerfilActualizado).not.toHaveBeenCalled();
  });

  test('si EditarPerfil falla (ej. correo ya registrado), NO audita ni notifica (propaga el error tal cual)', async () => {
    const antes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(antes);
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();

    const usecase: EditarPerfilUseCase = { ejecutar: jest.fn().mockRejectedValue(new CorreoYaRegistradoError()) };

    const decorator = new EditarPerfilConAuditoriaYNotificacion(usecase, analistaRepository, auditoriaRepository, servicioDeNotificaciones);

    await expect(decorator.ejecutar({ id: '1', nombre: 'Ana', correo: 'otro@example.com' })).rejects.toThrow(CorreoYaRegistradoError);
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarPerfilActualizado).not.toHaveBeenCalled();
  });

  test('audita ANTES de notificar', async () => {
    const antes = new Analista('1', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaRepository = analistaRepositorioFalso(antes);
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();

    const despues = new Analista('1', 'Ana Torres', new Correo('ana@example.com'), 'hash', 'analista');
    const usecase: EditarPerfilUseCase = { ejecutar: jest.fn().mockResolvedValue(despues) };

    const llamadas: string[] = [];
    (auditoriaRepository.registrar as jest.Mock).mockImplementation(async () => {
      llamadas.push('auditoria');
    });
    (servicioDeNotificaciones.notificarPerfilActualizado as jest.Mock).mockImplementation(async () => {
      llamadas.push('notificacion');
    });

    const decorator = new EditarPerfilConAuditoriaYNotificacion(usecase, analistaRepository, auditoriaRepository, servicioDeNotificaciones);
    await decorator.ejecutar({ id: '1', nombre: 'Ana Torres', correo: 'ana@example.com' });

    expect(llamadas).toEqual(['auditoria', 'notificacion']);
  });
});
