import { ObtenerNotificaciones } from '../../../src/application/usecases/module_notificaciones_alertas/ObtenerNotificaciones';
import { EliminarNotificacionesLeidas } from '../../../src/application/usecases/module_notificaciones_alertas/EliminarNotificacionesLeidas';
import { NotificacionRepository } from '../../../src/application/ports/out/persistencia/repositorios/NotificacionRepository';
import { Notificacion } from '../../../src/domain/entities/Notificacion';

function repositorioFalso(notificaciones: Notificacion[] = [], conteo = { total: 0, noLeidas: 0 }): jest.Mocked<NotificacionRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    listarPorAnalista: jest.fn().mockResolvedValue(notificaciones),
    contarPorAnalista: jest.fn().mockResolvedValue(conteo),
    marcarComoLeida: jest.fn().mockResolvedValue(true),
    marcarTodasComoLeidas: jest.fn().mockResolvedValue(0),
    eliminarVarias: jest.fn().mockResolvedValue(0),
    eliminarLeidas: jest.fn().mockResolvedValue(0)
  };
}

// RF-103. El centro de notificaciones se consulta de a páginas: un analista
// llegó a acumular más de 88.000 notificaciones, y traerlas todas juntas
// colgaba la pantalla.
describe('ObtenerNotificaciones', () => {
  test('devuelve una página de las notificaciones del analista, con el total y las no leídas de todo el centro', async () => {
    const notificaciones = [new Notificacion('1', 'InformeListo', 'analista-A', false, new Date(), 'Tu informe está listo')];
    const repositorio = repositorioFalso(notificaciones, { total: 137, noLeidas: 12 });

    const resultado = await new ObtenerNotificaciones(repositorio).ejecutar('analista-A');

    expect(resultado).toEqual({ notificaciones, total: 137, noLeidas: 12, limite: 50, desplazamiento: 0 });
    expect(repositorio.listarPorAnalista).toHaveBeenCalledWith('analista-A', { limite: 50, desplazamiento: 0 });
    expect(repositorio.contarPorAnalista).toHaveBeenCalledWith('analista-A');
  });

  test('respeta el límite y el desplazamiento pedidos', async () => {
    const repositorio = repositorioFalso();

    const resultado = await new ObtenerNotificaciones(repositorio).ejecutar('analista-A', { limite: 20, desplazamiento: 40 });

    expect(repositorio.listarPorAnalista).toHaveBeenCalledWith('analista-A', { limite: 20, desplazamiento: 40 });
    expect(resultado).toMatchObject({ limite: 20, desplazamiento: 40 });
  });

  test.each([
    ['un límite enorme se acota a 200', { limite: 1_000_000 }, { limite: 200, desplazamiento: 0 }],
    ['un límite de 0 o negativo pasa a 1', { limite: -5 }, { limite: 1, desplazamiento: 0 }],
    ['un desplazamiento negativo pasa a 0', { desplazamiento: -10 }, { limite: 50, desplazamiento: 0 }],
    ['los decimales se truncan', { limite: 10.9, desplazamiento: 3.7 }, { limite: 10, desplazamiento: 3 }],
    ['un valor que no es un número usa el valor por defecto', { limite: Number.NaN, desplazamiento: Number.POSITIVE_INFINITY }, { limite: 50, desplazamiento: 0 }]
  ])('nunca pide el listado completo: %s', async (_caso, pedida, esperada) => {
    const repositorio = repositorioFalso();

    await new ObtenerNotificaciones(repositorio).ejecutar('analista-A', pedida);

    expect(repositorio.listarPorAnalista).toHaveBeenCalledWith('analista-A', esperada);
  });
});

describe('EliminarNotificacionesLeidas — RF-104', () => {
  test('elimina las leídas del analista que lo pide y devuelve cuántas fueron', async () => {
    const repositorio = repositorioFalso();
    repositorio.eliminarLeidas.mockResolvedValue(88_690);

    const eliminadas = await new EliminarNotificacionesLeidas(repositorio).ejecutar('analista-A');

    expect(eliminadas).toBe(88_690);
    expect(repositorio.eliminarLeidas).toHaveBeenCalledWith('analista-A');
    expect(repositorio.eliminarVarias).not.toHaveBeenCalled();
  });
});
