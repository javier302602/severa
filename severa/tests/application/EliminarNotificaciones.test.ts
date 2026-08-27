import { EliminarNotificaciones } from '../../src/application/usecases/EliminarNotificaciones';
import { NotificacionRepository } from '../../src/application/ports/out/NotificacionRepository';

function notificacionRepositoryFalso(eliminarVarias: jest.Mock): NotificacionRepository {
  return {
    guardar: jest.fn(),
    listarPorAnalista: jest.fn(),
    marcarComoLeida: jest.fn(),
    marcarTodasComoLeidas: jest.fn(),
    eliminarVarias
  };
}

// "Eliminar seleccionadas" (2026-07-20): botón nuevo para limpiar el centro
// de notificaciones en lote.
describe('EliminarNotificaciones', () => {
  test('pasa los ids y el analistaId dueño al repositorio, devuelve cuántas se borraron', async () => {
    const eliminarVarias = jest.fn().mockResolvedValue(2);
    const usecase = new EliminarNotificaciones(notificacionRepositoryFalso(eliminarVarias));

    const resultado = await usecase.ejecutar(['notif-1', 'notif-2'], 'analista-A');

    expect(resultado).toBe(2);
    expect(eliminarVarias).toHaveBeenCalledWith(['notif-1', 'notif-2'], 'analista-A');
  });

  test('un id de otro analista en la lista no se cuenta (lo scopea el repositorio)', async () => {
    const eliminarVarias = jest.fn().mockResolvedValue(1);
    const usecase = new EliminarNotificaciones(notificacionRepositoryFalso(eliminarVarias));

    const resultado = await usecase.ejecutar(['notif-propia', 'notif-de-otro-analista'], 'analista-A');

    expect(resultado).toBe(1);
  });
});
