import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VulnerabilidadDetallePage } from '../../../src/pages/catalogo/VulnerabilidadDetallePage';
import { vulnerabilidadService } from '../../../src/api/vulnerabilidadService';
import { escalaService } from '../../../src/api/escalaService';
import { crearQueryClientDePrueba } from '../../testUtils';

vi.mock('../../../src/api/vulnerabilidadService', () => ({
  vulnerabilidadService: { obtenerPorCve: vi.fn() }
}));
vi.mock('../../../src/api/escalaService', () => ({
  escalaService: { obtener: vi.fn() }
}));

// RF-25 + RF-28/RF-69: la ficha muestra el nivel de riesgo con la escala del
// analista y dice cuál es esa escala, con un enlace a su configuración.
describe('VulnerabilidadDetallePage — nivel de riesgo', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra el nivel y la escala con la que se calculó, enlazada a la configuración', async () => {
    vi.mocked(escalaService.obtener).mockResolvedValue({
      personalizada: false,
      cortes: { moderado: 4, alto: 7, critico: 9 },
      rangos: [],
      descripcion: 'Escala CVSS (por defecto)',
      cortesCvss: { moderado: 4, alto: 7, critico: 9 }
    });
    vi.mocked(vulnerabilidadService.obtenerPorCve).mockResolvedValue({
      id: '1',
      cve: 'CVE-2021-08700',
      software: 'Router',
      cvssScore: 8.7,
      nivelDeRiesgo: 'Crítico',
      escala: 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5',
      tipoAcceso: 'Remoto'
    });

    render(
      <MemoryRouter initialEntries={['/catalogo/CVE-2021-08700']}>
        <QueryClientProvider client={crearQueryClientDePrueba()}>
          <Routes>
            <Route path="/catalogo/:cve" element={<VulnerabilidadDetallePage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Crítico')).toBeInTheDocument();
    // La escala es la que trae la ficha (con la que se calculó su nivel), no otra.
    const enlace = screen.getByRole('link', { name: 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5' });
    expect(enlace).toHaveAttribute('href', '/perfil#escala-de-clasificacion');
  });
});
