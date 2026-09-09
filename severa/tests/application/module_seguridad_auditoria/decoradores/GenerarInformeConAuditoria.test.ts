import { GenerarInformeConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/GenerarInformeConAuditoria';
import { GenerarInformeUseCase } from '../../../../src/application/ports/in/module_reportes_exportacion/GenerarInformeUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { RegistrarAnalisisRealizadoUseCase } from '../../../../src/application/ports/in/module_perfil_analista/RegistrarAnalisisRealizadoUseCase';
import { AnalisisRealizado } from '../../../../src/domain/entities/AnalisisRealizado';

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
    notificarInformeListo: jest.fn().mockResolvedValue(undefined),
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarPerfilActualizado: jest.fn().mockResolvedValue(undefined),
  notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
  };
}

function registrarAnalisisRealizadoFalso(): RegistrarAnalisisRealizadoUseCase {
  return {
    ejecutar: jest.fn().mockResolvedValue(new AnalisisRealizado('h1', 'analista-3', 'InformeGenerado', { formato: 'pdf' }))
  };
}

describe('GenerarInformeConAuditoria', () => {
  test('registra autor y formato del informe generado (RF-95), el historial del analista (RF-11/M-02) y notifica que quedó listo (RF-101)', async () => {
    const buffer = Buffer.from('pdf-falso');
    const usecase: GenerarInformeUseCase = { ejecutar: jest.fn().mockResolvedValue(buffer) };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const registrarAnalisisRealizadoUseCase = registrarAnalisisRealizadoFalso();
    const decorator = new GenerarInformeConAuditoria(usecase, auditoriaRepository, servicioDeNotificaciones, registrarAnalisisRealizadoUseCase);

    const resultado = await decorator.ejecutar('pdf', 'analista-3');

    expect(resultado).toBe(buffer);
    expect(usecase.ejecutar).toHaveBeenCalledWith('pdf', 'analista-3');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-3', accion: 'GenerarInforme', detalle: expect.stringContaining('pdf') })
    );
    expect(registrarAnalisisRealizadoUseCase.ejecutar).toHaveBeenCalledWith({
      analistaId: 'analista-3',
      tipoEvento: 'InformeGenerado',
      payload: { formato: 'pdf' }
    });
    expect(servicioDeNotificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-3', 'pdf');
  });
});
