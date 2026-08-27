import { GenerarInformeConAuditoria } from '../../../src/application/usecases/auditoria/GenerarInformeConAuditoria';
import { GenerarInformeUseCase } from '../../../src/application/ports/in/GenerarInformeUseCase';
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
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
  notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
  };
}

describe('GenerarInformeConAuditoria', () => {
  test('registra autor y formato del informe generado (RF-95) y notifica que quedó listo (RF-101)', async () => {
    const buffer = Buffer.from('pdf-falso');
    const usecase: GenerarInformeUseCase = { ejecutar: jest.fn().mockResolvedValue(buffer) };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new GenerarInformeConAuditoria(usecase, auditoriaRepository, servicioDeNotificaciones);

    const resultado = await decorator.ejecutar('pdf', 'analista-3');

    expect(resultado).toBe(buffer);
    expect(usecase.ejecutar).toHaveBeenCalledWith('pdf', 'analista-3');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-3', accion: 'GenerarInforme', detalle: expect.stringContaining('pdf') })
    );
    expect(servicioDeNotificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-3', 'pdf');
  });
});
