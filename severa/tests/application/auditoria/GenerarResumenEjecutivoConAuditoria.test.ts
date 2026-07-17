import { GenerarResumenEjecutivoConAuditoria } from '../../../src/application/usecases/auditoria/GenerarResumenEjecutivoConAuditoria';
import { GenerarResumenEjecutivoUseCase } from '../../../src/application/ports/in/GenerarResumenEjecutivoUseCase';
import { AuditoriaRepository } from '../../../src/application/ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../src/application/ports/out/ServicioDeNotificaciones';

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
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined)
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
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-3', accion: 'GenerarInforme', detalle: expect.stringContaining('Resumen ejecutivo') })
    );
    expect(servicioDeNotificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-3', 'pdf');
  });
});
