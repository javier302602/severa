import { GenerarInformeConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/GenerarInformeConAuditoria';
import { GenerarInformeUseCase } from '../../../../src/application/ports/in/module_reportes_exportacion/GenerarInformeUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { historialFalso } from '../../../dobles/HistorialAnalisisRepositoryEnMemoria';

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
  notificarLimpiezaCompletada: jest.fn().mockResolvedValue(undefined),
  notificarResumenDeAlertasDePlazo: jest.fn().mockResolvedValue(undefined),
  notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
  };
}

describe('GenerarInformeConAuditoria', () => {
  test('registra autor y formato del informe generado (RF-95), el historial del analista (RF-11/M-02) y notifica que quedó listo (RF-101)', async () => {
    const archivo = { contenido: Buffer.from('pdf-falso'), tipoMime: 'application/pdf', extension: 'pdf' };
    const usecase: GenerarInformeUseCase = { ejecutar: jest.fn().mockResolvedValue(archivo) };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const historial = historialFalso();
    const decorator = new GenerarInformeConAuditoria(usecase, auditoriaRepository, servicioDeNotificaciones, historial);

    const resultado = await decorator.ejecutar('pdf', 'analista-3');

    expect(resultado).toBe(archivo);
    expect(usecase.ejecutar).toHaveBeenCalledWith('pdf', 'analista-3', {});
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-3', accion: 'GenerarInforme', detalle: 'Informe completo (pdf)' })
    );
    expect(historial.delCatalogo).toHaveBeenCalledWith('analista-3', 'InformeGenerado', { cadaVez: true, detalle: 'Formato PDF' });
    expect(servicioDeNotificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-3', 'pdf');
  });

  test('Pasada 3: los formatos nuevos y la opción de gráficos pasan al caso de uso y quedan en la auditoría', async () => {
    const archivo = { contenido: Buffer.from('zip-falso'), tipoMime: 'application/zip', extension: 'zip' };
    const usecase: GenerarInformeUseCase = { ejecutar: jest.fn().mockResolvedValue(archivo) };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new GenerarInformeConAuditoria(usecase, auditoriaRepository, servicioDeNotificaciones, historialFalso());

    const resultado = await decorator.ejecutar('html', 'analista-3', { adjuntarGraficos: true });

    expect(resultado).toBe(archivo);
    expect(usecase.ejecutar).toHaveBeenCalledWith('html', 'analista-3', { adjuntarGraficos: true });
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'GenerarInforme', detalle: 'Informe completo (html, con gráficos adjuntos)' })
    );
    expect(servicioDeNotificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-3', 'html');
  });

  test('si generar el informe falla, no se registra ni se notifica nada', async () => {
    const usecase: GenerarInformeUseCase = { ejecutar: jest.fn().mockRejectedValue(new Error('catálogo vacío')) };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const historial = historialFalso();
    const decorator = new GenerarInformeConAuditoria(usecase, auditoriaRepository, servicioDeNotificaciones, historial);

    await expect(decorator.ejecutar('pdf', 'analista-3')).rejects.toThrow('catálogo vacío');
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
    expect(historial.delCatalogo).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarInformeListo).not.toHaveBeenCalled();
  });
});
