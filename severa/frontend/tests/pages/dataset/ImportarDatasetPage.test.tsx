import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportarDatasetPage } from '../../../src/pages/dataset/ImportarDatasetPage';
import { datasetService } from '../../../src/api/datasetService';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/datasetService', () => ({
  datasetService: {
    detectarColumnas: vi.fn(),
    importar: vi.fn(),
    importarDesdeUrl: vi.fn(),
    exportar: vi.fn(),
    reiniciar: vi.fn(),
    convertirUrlAExcel: vi.fn()
  }
}));

// Multi-tenancy (aislamiento por analista): "Restablecer mis datos" ya no es
// una acción administrativa — cualquier analista autenticado puede borrar
// SU PROPIO catálogo (el backend lo acota por analista_id, ver
// PostgresVulnerabilidadRepository.eliminarTodas), nunca el de otro. Por eso
// esta sección ahora es visible para cualquier rol, sin mockear AuthContext.
describe('ImportarDatasetPage — "Restablecer mis datos" (disponible para cualquier analista)', () => {
  afterEach(() => vi.clearAllMocks());

  test('la sección "Restablecer mis datos" es visible, pide confirmación antes de ejecutar, y muestra el resultado', async () => {
    vi.mocked(datasetService.reiniciar).mockResolvedValue({ eliminados: 45 });

    render(<ImportarDatasetPage />, { wrapper: EnvoltorioQuery });

    expect(screen.getByRole('heading', { name: 'Restablecer mis datos' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer mis datos' }));

    // El modal de confirmación debe aparecer ANTES de ejecutar nada.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/No afecta a otros usuarios/)).toBeInTheDocument();
    expect(datasetService.reiniciar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar todo lo mío' }));

    await waitFor(() => expect(datasetService.reiniciar).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Se eliminaron 45 vulnerabilidad\(es\) tuya\(s\)/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('cancelar el modal no ejecuta el borrado', () => {
    render(<ImportarDatasetPage />, { wrapper: EnvoltorioQuery });

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer mis datos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(datasetService.reiniciar).not.toHaveBeenCalled();
  });
});
