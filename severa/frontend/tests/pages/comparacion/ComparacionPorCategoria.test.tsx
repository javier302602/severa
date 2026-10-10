import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparacionPage } from '../../../src/pages/comparacion/ComparacionPage';
import { comparacionService } from '../../../src/api/comparacionService';
import { escalaService } from '../../../src/api/escalaService';
import { EnvoltorioQueryConRutas } from '../../testUtils';

vi.mock('../../../src/api/comparacionService', () => ({
  comparacionService: {
    compararAcceso: vi.fn(),
    compararTipo: vi.fn(),
    compararSoftware: vi.fn(),
    listarSoftwareDisponible: vi.fn(),
    compararPorCategoria: vi.fn()
  }
}));
vi.mock('../../../src/api/escalaService', () => ({
  escalaService: { obtener: vi.fn() }
}));

// M-08 (RF-62 a RF-64) + RF-28/RF-69: comparar por categoría desde la
// pantalla; agrupar por nivel de riesgo usa la escala del analista y la
// sección lo dice, con un enlace a su configuración.
const DESCRIPCION = 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5';

function preparar() {
  const grupos = { mediaA: null, mediaB: null, diferenciaMedias: null, sdA: null, sdB: null };
  vi.mocked(comparacionService.compararAcceso).mockResolvedValue(grupos);
  vi.mocked(comparacionService.compararTipo).mockResolvedValue(grupos);
  vi.mocked(comparacionService.compararSoftware).mockResolvedValue(grupos);
  vi.mocked(comparacionService.listarSoftwareDisponible).mockResolvedValue([]);
  vi.mocked(escalaService.obtener).mockResolvedValue({
    personalizada: true,
    cortes: { moderado: 4, alto: 7, critico: 8.5 },
    rangos: [],
    descripcion: DESCRIPCION,
    cortesCvss: { moderado: 4, alto: 7, critico: 9 }
  });
  vi.mocked(comparacionService.compararPorCategoria).mockImplementation(async (agrupacion) =>
    agrupacion === 'severidad'
      ? [
          { categoria: 'Bajo', media: 2.0, desviacionEstandar: null, cantidad: 1 },
          { categoria: 'Moderado', media: null, desviacionEstandar: null, cantidad: 0 },
          { categoria: 'Alto', media: null, desviacionEstandar: null, cantidad: 0 },
          { categoria: 'Crítico', media: 9.1, desviacionEstandar: 0.57, cantidad: 2 }
        ]
      : [
          { categoria: 'Remoto', media: 9.1, desviacionEstandar: 0.57, cantidad: 2 },
          { categoria: 'Local', media: 2.0, desviacionEstandar: null, cantidad: 1 }
        ]
  );
  render(<ComparacionPage />, { wrapper: EnvoltorioQueryConRutas });
}

describe('ComparacionPage — por categoría', () => {
  afterEach(() => vi.clearAllMocks());

  test('por defecto agrupa por nivel de riesgo, con los cuatro niveles y el rótulo de escala enlazado a Perfil', async () => {
    preparar();

    const seccion = (await screen.findByRole('heading', { name: 'Por categoría' })).closest('section') as HTMLElement;
    expect(await within(seccion).findByText('Crítico')).toBeInTheDocument();
    expect(comparacionService.compararPorCategoria).toHaveBeenCalledWith('severidad', 'cvssScore');
    const filas = within(seccion).getAllByRole('row').slice(1).map((fila) => fila.textContent);
    expect(filas).toEqual(['Bajo12.00N/A', 'Moderado0N/AN/A', 'Alto0N/AN/A', 'Crítico29.100.57']);
    expect(within(seccion).getByRole('link', { name: DESCRIPCION })).toHaveAttribute('href', '/perfil#escala-de-clasificacion');
  });

  test('al agrupar por otra variable pide esa variable y ya no muestra el rótulo de escala', async () => {
    preparar();
    const usuario = userEvent.setup();
    const seccion = (await screen.findByRole('heading', { name: 'Por categoría' })).closest('section') as HTMLElement;
    await within(seccion).findByText('Crítico');

    await usuario.selectOptions(within(seccion).getByLabelText('Agrupar por'), 'tipoAcceso');

    expect(await within(seccion).findByText('Remoto')).toBeInTheDocument();
    expect(comparacionService.compararPorCategoria).toHaveBeenLastCalledWith('tipoAcceso', 'cvssScore');
    expect(within(seccion).queryByRole('link', { name: DESCRIPCION })).not.toBeInTheDocument();
  });
});
