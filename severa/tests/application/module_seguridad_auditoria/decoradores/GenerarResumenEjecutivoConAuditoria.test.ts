import { GenerarResumenEjecutivoConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/GenerarResumenEjecutivoConAuditoria';
import { GenerarResumenEjecutivoUseCase } from '../../../../src/application/ports/in/module_reportes_exportacion/GenerarResumenEjecutivoUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

function servicioDeNotificacionesFalso(): ServicioDeNotificaciones {
  return {
    notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
    notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
    notificarInformeListo: jest.fn().mockResolvedValue(undefined),
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
  notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
  };
}

describe('GenerarResumenEjecutivoConAuditoria', () => {
  test('registra autor (RF-95) y notifica que el resumen ejecutivo quedó listo (RF-101)', async () => {
    const buffer = Buffer.from('resumen-falso');
    const usecase: GenerarResumenEjecutivoUseCase = { ejecutar: jest.fn().mockResolvedValue(buffer) };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new GenerarResumenEjecutivoConAuditoria(usecase, auditoriaRepository, servicioDeNotificaciones);

    const resultado = await decorator.ejecutar('analista-3');

    expect(resultado).toBe(buffer);
    expect(usecase.ejecutar).toHaveBeenCalledWith('analista-3');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-3', accion: 'GenerarInforme', detalle: expect.stringContaining('Resumen ejecutivo') })
    );
    expect(servicioDeNotificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-3', 'pdf');
  });
});
