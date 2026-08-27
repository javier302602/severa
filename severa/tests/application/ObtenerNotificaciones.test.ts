import { ObtenerNotificaciones } from '../../src/application/usecases/ObtenerNotificaciones';
import { NotificacionRepository } from '../../src/application/ports/out/NotificacionRepository';
import { Notificacion } from '../../src/domain/entities/Notificacion';

describe('ObtenerNotificaciones', () => {
  test('devuelve solo las notificaciones del analista solicitante', async () => {
    const notificaciones = [new Notificacion('1', 'VulnerabilidadCritica', 'analista-A', false, new Date(), 'CVE-2024-00001')];
    const notificacionRepository: NotificacionRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
      listarPorAnalista: jest.fn().mockResolvedValue(notificaciones),
      marcarComoLeida: jest.fn().mockResolvedValue(true),
    marcarTodasComoLeidas: jest.fn().mockResolvedValue(0),
    eliminarVarias: jest.fn().mockResolvedValue(0)
    };

    const usecase = new ObtenerNotificaciones(notificacionRepository);
    const resultado = await usecase.ejecutar('analista-A');

    expect(resultado).toBe(notificaciones);
    expect(notificacionRepository.listarPorAnalista).toHaveBeenCalledWith('analista-A');
  });
});
