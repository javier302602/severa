import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditoriaPage } from '../../../src/pages/auditoria/AuditoriaPage';
import { auditoriaService, type RegistroAuditoria } from '../../../src/api/auditoriaService';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/auditoriaService', () => ({ auditoriaService: { listar: vi.fn() } }));

const registro = (cambios: Partial<RegistroAuditoria>): RegistroAuditoria => ({
  id: 'a1',
  usuario: 'analista-1',
  accion: 'Login',
  detalle: 'Inicio de sesión',
  fechaHora: '2026-03-01T10:00:00.000Z',
  datasetId: null,
  ...cambios
});

// RF-138: "el administrador puede consultar la auditoría completa de un
// dataset específico".
describe('AuditoriaPage', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra todo el historial; los registros sobre un dataset ofrecen filtrar por él', async () => {
    vi.mocked(auditoriaService.listar).mockResolvedValue([
      registro({ id: 'a1' }),
      registro({ id: 'a2', accion: 'LimpiarDatasetGenerico', detalle: 'Versión 1 de "encuesta.csv"', datasetId: 'dataset-1' })
    ]);

    render(<AuditoriaPage />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('LimpiarDatasetGenerico')).toBeInTheDocument();
    expect(auditoriaService.listar).toHaveBeenCalledWith(undefined);
    expect(screen.getAllByRole('button', { name: /Ver solo la auditoría del dataset/ })).toHaveLength(1);
  });

  test('filtrar por un dataset vuelve a consultar solo lo de ese dataset, y se puede volver a ver todo', async () => {
    vi.mocked(auditoriaService.listar).mockImplementation((datasetId?: string) =>
      Promise.resolve(
        datasetId
          ? [registro({ id: 'a2', accion: 'LimpiarDatasetGenerico', datasetId: 'dataset-1' })]
          : [registro({ id: 'a1' }), registro({ id: 'a2', accion: 'LimpiarDatasetGenerico', datasetId: 'dataset-1' })]
      )
    );
    render(<AuditoriaPage />, { wrapper: EnvoltorioQuery });

    await userEvent.click(await screen.findByRole('button', { name: 'Ver solo la auditoría del dataset dataset-1' }));

    await waitFor(() => expect(auditoriaService.listar).toHaveBeenLastCalledWith('dataset-1'));
    expect(await screen.findByText(/Mostrando solo las operaciones sobre el dataset/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Login')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Ver todo el historial' }));

    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando solo las operaciones/)).not.toBeInTheDocument();
  });

  test('un dataset sin operaciones auditadas lo dice', async () => {
    vi.mocked(auditoriaService.listar).mockImplementation((datasetId?: string) =>
      Promise.resolve(datasetId ? [] : [registro({ id: 'a2', datasetId: 'dataset-1' })])
    );
    render(<AuditoriaPage />, { wrapper: EnvoltorioQuery });

    await userEvent.click(await screen.findByRole('button', { name: 'Ver solo la auditoría del dataset dataset-1' }));

    expect(await screen.findByText('No hay operaciones auditadas sobre ese dataset.')).toBeInTheDocument();
  });
});
