import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusquedaAvanzadaPage } from '../../../src/pages/busqueda/BusquedaAvanzadaPage';
import { busquedaService } from '../../../src/api/busquedaService';
import { filtroFavoritoService } from '../../../src/api/filtroFavoritoService';
import { escalaService } from '../../../src/api/escalaService';
import { EnvoltorioQueryConRutas } from '../../testUtils';

vi.mock('../../../src/api/busquedaService', () => ({
  TAMANO_PAGINA: 200,
  busquedaService: { buscar: vi.fn(), exportar: vi.fn() }
}));
vi.mock('../../../src/api/filtroFavoritoService', () => ({
  filtroFavoritoService: { listar: vi.fn(), guardar: vi.fn() }
}));
vi.mock('../../../src/api/escalaService', () => ({
  escalaService: { obtener: vi.fn() }
}));

// RF-28 / RF-69 (Modo B) en la búsqueda avanzada: el filtro dice "Nivel de
// riesgo" con el vocabulario unificado, cada resultado muestra su nivel con
// la escala vigente, la pantalla dice qué escala usa (y lleva a configurarla),
// y un favorito guardado con el nombre viejo se ve y se aplica con el nuevo.
const ESCALA_PROPIA = {
  personalizada: true,
  cortes: { moderado: 4, alto: 7, critico: 8.5 },
  rangos: [],
  descripcion: 'Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5',
  cortesCvss: { moderado: 4, alto: 7, critico: 9 }
};

function preparar() {
  vi.mocked(escalaService.obtener).mockResolvedValue(ESCALA_PROPIA);
  vi.mocked(filtroFavoritoService.listar).mockResolvedValue([
    { id: 'f1', analistaId: 'a', nombre: 'Críticos de siempre', criterios: { severidad: 'Crítica' }, fechaCreacion: '2026-01-01T00:00:00Z' }
  ]);
  vi.mocked(busquedaService.buscar).mockResolvedValue([
    { cve: 'CVE-2021-08700', cvssScore: 8.7, nivelDeRiesgo: 'Crítico', software: 'Router', estadoRemediacion: 'Pendiente', fechaCarga: '2026-01-01T00:00:00Z' }
  ]);
  render(<BusquedaAvanzadaPage />, { wrapper: EnvoltorioQueryConRutas });
}

describe('BusquedaAvanzadaPage — nivel de riesgo con la escala del analista', () => {
  afterEach(() => vi.clearAllMocks());

  test('el filtro se llama "Nivel de riesgo" y ofrece Bajo, Moderado, Alto y Crítico', async () => {
    preparar();

    const selector = screen.getByLabelText('Nivel de riesgo');
    expect(within(selector).getAllByRole('option').map((opcion) => opcion.textContent)).toEqual(['—', 'Bajo', 'Moderado', 'Alto', 'Crítico']);
  });

  test('la pantalla dice qué escala usa, con un enlace a su configuración', async () => {
    preparar();

    const enlace = await screen.findByRole('link', { name: ESCALA_PROPIA.descripcion });
    expect(enlace).toHaveAttribute('href', '/perfil#escala-de-clasificacion');
  });

  test('cada resultado muestra el nivel que calculó el backend con la escala vigente', async () => {
    preparar();
    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText('Nivel de riesgo'), 'Crítico');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(busquedaService.buscar).toHaveBeenCalledWith(expect.objectContaining({ severidad: 'Crítico' }), 1);
    const fila = (await screen.findByText('CVE-2021-08700')).closest('tr') as HTMLElement;
    expect(within(fila).getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nivel de riesgo' })).toBeInTheDocument();
  });

  test('un favorito guardado con el nombre viejo ("Crítica") se muestra y se aplica con el nuevo ("Crítico")', async () => {
    preparar();
    const usuario = userEvent.setup();

    expect(await screen.findByText('Nivel de riesgo: Crítico')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Usar este filtro' }));

    expect(screen.getByLabelText('Nivel de riesgo')).toHaveValue('Crítico');
    // Se busca con lo que tiene guardado; el backend lo interpreta con la escala vigente.
    expect(busquedaService.buscar).toHaveBeenCalledWith(expect.objectContaining({ severidad: 'Crítica' }), 1);
  });
});
