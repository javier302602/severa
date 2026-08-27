import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TarjetaGrafico } from '../../../src/components/graficos/TarjetaGrafico';
import { graficoService } from '../../../src/api/graficoService';
import { HttpError } from '../../../src/api/httpClient';
import { EnvoltorioQuery } from '../../testUtils';

// Componente más directamente relacionado con el bug real encontrado en
// vivo (SvgGraficosAdapter.ts devolvía siempre el mismo placeholder): este
// test cubre el otro extremo del mismo flujo — que el SVG que llega del
// backend efectivamente se inserte en el DOM vía dangerouslySetInnerHTML,
// no solo que el hook lo reciba. Contrato actualizado: el service ya no
// devuelve el SVG crudo como string, sino { svg, interpretacion } (Mejora
// "interpretación en prosa en Gráficos").
vi.mock('../../../src/api/graficoService', () => ({
  graficoService: { obtener: vi.fn() }
}));

describe('TarjetaGrafico', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('inserta el SVG real que devuelve el backend en el DOM', async () => {
    vi.mocked(graficoService.obtener).mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" data-testid="svg-real"><rect width="10" height="10" /></svg>',
      interpretacion: 'Análisis de prueba.'
    });

    render(<TarjetaGrafico tipo="histogramaCvss" titulo="Histograma de CVSS" />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByTestId('svg-real')).toBeInTheDocument());
    expect(document.querySelector('svg rect')).not.toBeNull();
  });

  test('muestra el texto de interpretación debajo del gráfico', async () => {
    vi.mocked(graficoService.obtener).mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      interpretacion: '50.0% de las vulnerabilidades analizadas son Crítica o Alta.'
    });

    render(<TarjetaGrafico tipo="barrasSeveridad" titulo="Distribución por severidad" />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText('50.0% de las vulnerabilidades analizadas son Crítica o Alta.')).toBeInTheDocument();
  });

  test('muestra el spinner mientras carga', () => {
    vi.mocked(graficoService.obtener).mockReturnValue(new Promise(() => {}));

    render(<TarjetaGrafico tipo="boxplotCvss" titulo="Boxplot" />, { wrapper: EnvoltorioQuery });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('catálogo vacío (400 "no puede estar vacía"): muestra el estado vacío, no un error genérico', async () => {
    vi.mocked(graficoService.obtener).mockRejectedValue(
      new HttpError(400, 'La lista de CVSS Score no puede estar vacía')
    );

    render(<TarjetaGrafico tipo="histogramaCvss" titulo="Histograma" />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByText('Sin datos todavía.')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('otro error (no catálogo vacío): muestra el mensaje de error real', async () => {
    vi.mocked(graficoService.obtener).mockRejectedValue(new HttpError(500, 'Error interno inesperado'));

    render(<TarjetaGrafico tipo="histogramaCvss" titulo="Histograma" />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Error interno inesperado'));
  });

  test('pasa el título y el límite recibidos como props al service', async () => {
    vi.mocked(graficoService.obtener).mockResolvedValue({ svg: '<svg />', interpretacion: '' });

    render(<TarjetaGrafico tipo="topSoftware" titulo="Top 10 software" limite={10} />, { wrapper: EnvoltorioQuery });

    expect(screen.getByText('Top 10 software')).toBeInTheDocument();
    await waitFor(() => expect(graficoService.obtener).toHaveBeenCalledWith('topSoftware', 10, expect.any(AbortSignal)));
  });
});
