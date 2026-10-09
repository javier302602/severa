import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificacionesPage } from '../../../src/pages/notificaciones/NotificacionesPage';
import { notificacionService } from '../../../src/api/notificacionService';
import type { Notificacion } from '../../../src/types/Notificacion';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/notificacionService', () => ({
  notificacionService: { listar: vi.fn(), marcarComoLeida: vi.fn(), marcarTodasComoLeidas: vi.fn(), eliminarVarias: vi.fn() }
}));

// useNotificaciones solo consulta cuando hay un analista con sesión.
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: () => ({ analista: { id: 'analista-1', nombre: 'Ana', correo: 'ana@example.com', rol: 'analista' } })
}));

const notificacion = (id: string, tipo: string, mensaje: string): Notificacion =>
  ({ id, tipo, leida: false, fecha: '2026-03-01T10:00:00.000Z', mensaje }) as Notificacion;

describe('NotificacionesPage — etiqueta de cada tipo', () => {
  afterEach(() => vi.clearAllMocks());

  test('cada tipo que emite el backend tiene su etiqueta, incluidos los que antes salían en blanco', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue([
      notificacion('n1', 'LimpiezaCompletada', 'Limpieza de "encuesta.csv" completada'),
      notificacion('n2', 'PlazoProximoAVencer', 'El plazo de CVE-2021-44228 vence en 2 días'),
      notificacion('n3', 'PerfilActualizado', 'Se actualizó tu correo'),
      notificacion('n4', 'InformeListo', 'Tu informe está listo')
    ]);

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    // RF-122: la notificación de resumen de una limpieza.
    expect(await screen.findByText('Limpieza completada')).toBeInTheDocument();
    expect(screen.getByText('Plazo próximo a vencer')).toBeInTheDocument();
    expect(screen.getByText('Perfil actualizado')).toBeInTheDocument();
    expect(screen.getByText('Informe listo')).toBeInTheDocument();
  });

  test('un tipo que esta pantalla todavía no conoce se muestra con una etiqueta genérica, no vacío', async () => {
    vi.mocked(notificacionService.listar).mockResolvedValue([notificacion('n1', 'TipoDelFuturo', 'Algo nuevo pasó')]);

    render(<NotificacionesPage />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('Algo nuevo pasó')).toBeInTheDocument();
    expect(screen.getByText('Notificación')).toBeInTheDocument();
  });
});
