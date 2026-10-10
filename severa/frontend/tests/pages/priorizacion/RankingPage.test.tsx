import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RankingPage } from '../../../src/pages/priorizacion/RankingPage';
import { priorizacionService } from '../../../src/api/priorizacionService';
import { escalaService } from '../../../src/api/escalaService';
import { EnvoltorioQueryConRutas } from '../../testUtils';

vi.mock('../../../src/api/priorizacionService', () => ({
  priorizacionService: { obtenerRanking: vi.fn(), marcarEstado: vi.fn() }
}));
vi.mock('../../../src/api/escalaService', () => ({
  escalaService: { obtener: vi.fn() }
}));

// RF-70/RF-71 + RF-28/RF-69: el ranking se pide por nivel de riesgo (con el
// vocabulario unificado), cada fila muestra el plazo de su nivel, y la
// pantalla dice con qué escala se armaron los niveles.
const DESCRIPCION = 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5';

function preparar() {
  vi.mocked(escalaService.obtener).mockResolvedValue({
    personalizada: true,
    cortes: { moderado: 4, alto: 7, critico: 8.5 },
    rangos: [],
    descripcion: DESCRIPCION,
    cortesCvss: { moderado: 4, alto: 7, critico: 9 }
  });
  vi.mocked(priorizacionService.obtenerRanking).mockImplementation(async (nivel) =>
    nivel === 'Crítico'
      ? [{ posicion: 1, cve: 'CVE-2026-0870', cvssScore: 8.7, nivelDeRiesgo: 'Crítico', plazoRecomendado: 7, diasParaParche: 5, estado: 'Pendiente' }]
      : []
  );
  render(<RankingPage />, { wrapper: EnvoltorioQueryConRutas });
}

describe('RankingPage — niveles con la escala del analista', () => {
  afterEach(() => vi.clearAllMocks());

  test('las pestañas usan el vocabulario unificado y piden por `nivel`', async () => {
    preparar();
    const usuario = userEvent.setup();

    const pestanas = screen.getByRole('tablist', { name: 'Nivel de riesgo' });
    expect(within(pestanas).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Crítico', 'Alto', 'Moderado', 'Bajo']);
    expect(priorizacionService.obtenerRanking).toHaveBeenCalledWith('Crítico');

    await usuario.click(within(pestanas).getByRole('tab', { name: 'Moderado' }));
    expect(priorizacionService.obtenerRanking).toHaveBeenLastCalledWith('Moderado');
    expect(await screen.findByText(/No hay vulnerabilidades de nivel de riesgo "Moderado"/)).toBeInTheDocument();
  });

  test('cada fila muestra el plazo recomendado de su nivel, y la pantalla el rótulo de escala enlazado a Perfil', async () => {
    preparar();

    const fila = (await screen.findByText('CVE-2026-0870')).closest('tr') as HTMLElement;
    expect(within(fila).getByText('7 días')).toBeInTheDocument();
    expect(within(fila).getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: DESCRIPCION })).toHaveAttribute('href', '/perfil#escala-de-clasificacion');
  });
});
