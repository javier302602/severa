import { MarcarTodasLasNotificacionesLeidas } from '../../src/application/usecases/MarcarTodasLasNotificacionesLeidas';
import { NotificacionRepository } from '../../src/application/ports/out/NotificacionRepository';

function notificacionRepositoryFalso(marcarTodasComoLeidas: jest.Mock): NotificacionRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    listarPorAnalista: jest.fn().mockResolvedValue([]),
    marcarComoLeida: jest.fn().mockResolvedValue(true),
    marcarTodasComoLeidas,
    eliminarVarias: jest.fn().mockResolvedValue(0)
  };
}

describe('MarcarTodasLasNotificacionesLeidas', () => {
  test('pasa el analistaId dueño y devuelve cuántas se marcaron', async () => {
    const marcarTodasComoLeidas = jest.fn().mockResolvedValue(4);
    const usecase = new MarcarTodasLasNotificacionesLeidas(notificacionRepositoryFalso(marcarTodasComoLeidas));

    const resultado = await usecase.ejecutar('analista-A');

    expect(resultado).toBe(4);
    expect(marcarTodasComoLeidas).toHaveBeenCalledWith('analista-A');
  });

  test('si ya estaban todas leídas, devuelve 0 sin romper', async () => {
    const marcarTodasComoLeidas = jest.fn().mockResolvedValue(0);
    const usecase = new MarcarTodasLasNotificacionesLeidas(notificacionRepositoryFalso(marcarTodasComoLeidas));

    const resultado = await usecase.ejecutar('analista-A');

    expect(resultado).toBe(0);
  });
});
