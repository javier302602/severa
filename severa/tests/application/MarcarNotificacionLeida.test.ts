import { MarcarNotificacionLeida } from '../../src/application/usecases/MarcarNotificacionLeida';
import { NotificacionRepository } from '../../src/application/ports/out/NotificacionRepository';

function notificacionRepositoryFalso(marcarComoLeida: jest.Mock): NotificacionRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    listarPorAnalista: jest.fn().mockResolvedValue([]),
    marcarComoLeida
  };
}

describe('MarcarNotificacionLeida', () => {
  test('marca como leída y pasa el id de la notificación y del analista dueño al repositorio', async () => {
    const marcarComoLeida = jest.fn().mockResolvedValue(true);
    const notificacionRepository = notificacionRepositoryFalso(marcarComoLeida);
    const usecase = new MarcarNotificacionLeida(notificacionRepository);

    const resultado = await usecase.ejecutar('notif-1', 'analista-A');

    expect(resultado).toBe(true);
    expect(marcarComoLeida).toHaveBeenCalledWith('notif-1', 'analista-A');
  });

  test('devuelve false si la notificación no existe o pertenece a otro analista', async () => {
    const marcarComoLeida = jest.fn().mockResolvedValue(false);
    const notificacionRepository = notificacionRepositoryFalso(marcarComoLeida);
    const usecase = new MarcarNotificacionLeida(notificacionRepository);

    const resultado = await usecase.ejecutar('notif-de-otro-analista', 'analista-A');

    expect(resultado).toBe(false);
  });
});
