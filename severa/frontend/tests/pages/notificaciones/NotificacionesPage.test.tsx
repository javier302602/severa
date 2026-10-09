import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificacionesPage } from '../../../src/pages/notificaciones/NotificacionesPage';
import { notificacionService } from '../../../src/api/notificacionService';
import type { Notificacion, PaginaDeNotificaciones } from '../../../src/types/Notificacion';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/notificacionService', () => ({
  NOTIFICACIONES_POR_PAGINA: 50,
  notificacionService: { listar: vi.fn(), marcarComoLeida: vi.fn(), marcarTodasComoLeidas: vi.fn(), eliminarVarias: vi.fn(), eliminarLeidas: vi.fn() }
}));

// useNotificaciones solo consulta cuando hay un analista con sesión.
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: () => ({ analista: { id: 'analista-1', nombre: 'Ana', correo: 'ana@example.com', rol: 'analista' } })
}));

const notificacion = (id: string, tipo: string, mensaje: string, leida = false): Notificacion =>
  ({ id, tipo, leida, fecha: '2026-03-01T10:00:00.000Z', mensaje }) as Notificacion;

function pagina(notificaciones: Notificacion[], extras: Partial<PaginaDeNotificaciones> = {}): PaginaDeNotificaciones {
  return {
    notificaciones,
    total: notificaciones.length,
    noLeidas: notificaciones.filter((n) => !n.leida).length,
    limite: 50,
    desplazamiento: 0,
    ...extras
  };
}

describe('NotificacionesPage — etiqueta de cada tipo', () => {
  afterEach(() => vi.clearAllMocks());

  test('cada tipo que emite el backend tiene su etiqueta, incluidos los que antes salían en blanco', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(
      pagina([
        notificacion('n1', 'LimpiezaCompletada', 'Limpieza de "encuesta.csv" completada'),
        notificacion('n2', 'PlazoProximoAVencer', 'El plazo de CVE-2021-44228 vence en 2 días'),
        notificacion('n3', 'PerfilActualizado', 'Se actualizó tu correo'),
        notificacion('n4', 'InformeListo', 'Tu informe está listo')
      ])
    );

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    // RF-122: la notificación de resumen de una limpieza.
    expect(await screen.findByText('Limpieza completada')).toBeInTheDocument();
    expect(screen.getByText('Plazo próximo a vencer')).toBeInTheDocument();
    expect(screen.getByText('Perfil actualizado')).toBeInTheDocument();
    expect(screen.getByText('Informe listo')).toBeInTheDocument();
  });

  test('un tipo que esta pantalla todavía no conoce se muestra con una etiqueta genérica, no vacío', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(pagina([notificacion('n1', 'TipoDelFuturo', 'Algo nuevo pasó')]));

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('Algo nuevo pasó')).toBeInTheDocument();
    expect(screen.getByText('Notificación')).toBeInTheDocument();
  });
});

// RF-103: con miles de notificaciones acumuladas la pantalla montaba una fila
// por cada una y se colgaba. Ahora pide y dibuja una página por vez.
describe('NotificacionesPage — paginado', () => {
  afterEach(() => vi.clearAllMocks());

  const cincuenta = (desde: number) => Array.from({ length: 50 }, (_, i) => notificacion(`n${desde + i}`, 'InformeListo', `Notificación ${desde + i}`));

  test('pide solo la primera página, aunque haya miles, y muestra el total y las no leídas de todo el centro', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(pagina(cincuenta(1), { total: 88_697, noLeidas: 88_650 }));

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('Notificación 1')).toBeInTheDocument();
    expect(notificacionService.listar).toHaveBeenCalledWith(0);
    // Se dibujan 50 filas, no 88.697.
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByRole('status')).toHaveTextContent('88697 notificación(es), 88650 sin leer. Mostrando 1–50.');
    expect(screen.getByText('Página 1 de 1774')).toBeInTheDocument();
  });

  test('"Más antiguas" pide la página siguiente, y "Más recientes" vuelve', async () => {
    vi.mocked(notificacionService.listar).mockImplementation((numero = 0) =>
      Promise.resolve(pagina(cincuenta(numero * 50 + 1), { total: 120, noLeidas: 120, desplazamiento: numero * 50 }))
    );
    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });
    await screen.findByText('Notificación 1');
    expect(screen.getByRole('button', { name: '← Más recientes' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Más antiguas →' }));

    expect(await screen.findByText('Notificación 51')).toBeInTheDocument();
    expect(notificacionService.listar).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.queryByText('Notificación 1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '← Más recientes' }));
    expect(await screen.findByText('Notificación 1')).toBeInTheDocument();
  });

  test('en la última página "Más antiguas" queda deshabilitado', async () => {
    vi.mocked(notificacionService.listar).mockImplementation((numero = 0) =>
      Promise.resolve(pagina(numero === 0 ? cincuenta(1) : [notificacion('n51', 'InformeListo', 'Notificación 51')], { total: 51, noLeidas: 51 }))
    );
    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });
    await screen.findByText('Notificación 1');

    await userEvent.click(screen.getByRole('button', { name: 'Más antiguas →' }));

    await screen.findByText('Notificación 51');
    expect(screen.getByRole('button', { name: 'Más antiguas →' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 51–51.');
  });

  test('con una sola página no muestra el paginado', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(pagina([notificacion('n1', 'InformeListo', 'Tu informe está listo')]));

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    await screen.findByText('Tu informe está listo');
    expect(screen.queryByRole('navigation', { name: 'Páginas de notificaciones' })).not.toBeInTheDocument();
  });

  test('la selección es de la página que se ve: al cambiar de página se vacía', async () => {
    vi.mocked(notificacionService.listar).mockImplementation((numero = 0) =>
      Promise.resolve(pagina(cincuenta(numero * 50 + 1), { total: 100, noLeidas: 100 }))
    );
    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });
    await userEvent.click(await screen.findByLabelText('Seleccionar notificación: Notificación 1'));
    expect(screen.getByRole('button', { name: 'Eliminar seleccionadas (1)' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Más antiguas →' }));

    await screen.findByText('Notificación 51');
    expect(screen.getByRole('button', { name: 'Eliminar seleccionadas' })).toBeDisabled();
  });

  test('sin notificaciones lo dice, sin paginado ni contador', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(pagina([]));

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('No tenés notificaciones.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

// RF-104: vaciar de una vez lo ya leído.
describe('NotificacionesPage — eliminar las leídas', () => {
  afterEach(() => vi.clearAllMocks());

  test('ofrece eliminar las leídas diciendo cuántas son (de todo el centro), y lo pide al backend', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(
      pagina([notificacion('n1', 'InformeListo', 'Leída', true), notificacion('n2', 'InformeListo', 'Sin leer')], { total: 900, noLeidas: 100 })
    );
    vi.mocked(notificacionService.eliminarLeidas).mockResolvedValue({ eliminadas: 800 });
    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar las leídas (800)' }));

    await waitFor(() => expect(notificacionService.eliminarLeidas).toHaveBeenCalledTimes(1));
    // No toca las seleccionadas: es otra operación.
    expect(notificacionService.eliminarVarias).not.toHaveBeenCalled();
  });

  test('si no hay ninguna leída, no ofrece el botón', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue(pagina([notificacion('n1', 'InformeListo', 'Sin leer')]));

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    await screen.findByText('Sin leer');
    expect(screen.queryByRole('button', { name: /Eliminar las leídas/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeInTheDocument();
  });
});
