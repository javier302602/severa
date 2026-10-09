import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DistribucionFrecuenciasPage } from '../../../src/pages/estadisticas/DistribucionFrecuenciasPage';
import { estadisticaService, type FilaFrecuenciaAgrupada } from '../../../src/api/estadisticaService';
import { HttpError } from '../../../src/api/httpClient';
import { descargarArchivo } from '../../../src/utils/descargarArchivo';
import { crearQueryClientDePrueba } from '../../testUtils';

vi.mock('../../../src/api/estadisticaService', async (original) => ({
  ...(await original<typeof import('../../../src/api/estadisticaService')>()),
  estadisticaService: {
    obtenerResumen: vi.fn(),
    obtenerFrecuenciasAgrupadas: vi.fn(),
    obtenerFrecuenciasSinAgrupar: vi.fn(),
    exportarFrecuencias: vi.fn()
  }
}));
vi.mock('../../../src/utils/descargarArchivo', () => ({ descargarArchivo: vi.fn() }));

function fila(intervalo: string, inferior: number, superior: number, frecuencia: number): FilaFrecuenciaAgrupada {
  return {
    intervalo,
    limiteInferior: inferior,
    limiteSuperior: superior,
    marcaDeClase: (inferior + superior) / 2,
    frecuenciaAbsoluta: frecuencia,
    frecuenciaRelativa: 0.5,
    frecuenciaRelativaPorcentaje: 50,
    frecuenciaAcumulada: frecuencia,
    frecuenciaRelativaAcumulada: 0.5
  };
}

function renderizar() {
  return render(
    <QueryClientProvider client={crearQueryClientDePrueba()}>
      <MemoryRouter>
        <DistribucionFrecuenciasPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DistribucionFrecuenciasPage', () => {
  beforeEach(() => {
    vi.mocked(estadisticaService.obtenerFrecuenciasAgrupadas).mockResolvedValue([fila('[0-2)', 0, 2, 3), fila('[8-10]', 8, 10, 3)]);
    vi.mocked(estadisticaService.obtenerFrecuenciasSinAgrupar).mockResolvedValue([{ valor: 7, frecuencia: 4 }]);
  });
  afterEach(() => vi.clearAllMocks());

  test('al entrar pide la tabla agrupada de CVSS con intervalos automáticos, y no la tabla que no se está mirando', async () => {
    renderizar();

    expect(await screen.findByText('[8-10]')).toBeInTheDocument();
    expect(estadisticaService.obtenerFrecuenciasAgrupadas).toHaveBeenCalledWith({ variable: 'cvssScore', numeroDeIntervalos: undefined });
    expect(estadisticaService.obtenerFrecuenciasSinAgrupar).not.toHaveBeenCalled();
  });

  test('RF-33: elegir otra variable vuelve a pedir la tabla para esa variable', async () => {
    renderizar();
    await screen.findByText('[8-10]');

    await userEvent.selectOptions(screen.getByLabelText('Variable'), 'diasParaParche');

    await waitFor(() =>
      expect(estadisticaService.obtenerFrecuenciasAgrupadas).toHaveBeenLastCalledWith({ variable: 'diasParaParche', numeroDeIntervalos: undefined })
    );
  });

  test('RF-39: un número de intervalos válido se manda al backend', async () => {
    renderizar();
    await screen.findByText('[8-10]');

    await userEvent.type(screen.getByLabelText('Número de intervalos'), '4');

    await waitFor(() =>
      expect(estadisticaService.obtenerFrecuenciasAgrupadas).toHaveBeenLastCalledWith({ variable: 'cvssScore', numeroDeIntervalos: 4 })
    );
  });

  test('RF-39: un número fuera de rango no se pide — se avisa y la tabla anterior sigue en pantalla', async () => {
    renderizar();
    await screen.findByText('[8-10]');
    const llamadasAntes = vi.mocked(estadisticaService.obtenerFrecuenciasAgrupadas).mock.calls.length;

    await userEvent.type(screen.getByLabelText('Número de intervalos'), '1');

    expect(screen.getByText(/número entero entre 2 y 30/)).toBeInTheDocument();
    expect(screen.getByLabelText('Número de intervalos')).toHaveAttribute('aria-invalid', 'true');
    expect(estadisticaService.obtenerFrecuenciasAgrupadas).toHaveBeenCalledTimes(llamadasAntes);
    expect(screen.getByText('[8-10]')).toBeInTheDocument();
  });

  test('la vista sin agrupar no ofrece número de intervalos y rotula la columna con la variable elegida', async () => {
    renderizar();
    await screen.findByText('[8-10]');

    await userEvent.click(screen.getByRole('button', { name: 'Sin agrupar' }));

    expect(await screen.findByText('7.0')).toBeInTheDocument();
    expect(screen.queryByLabelText('Número de intervalos')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'CVSS Score' })).toBeInTheDocument();
  });

  test('RF-38: exportar pide el .xlsx de la tabla que está en pantalla (misma vista, variable e intervalos) y lo descarga', async () => {
    const blob = new Blob(['xlsx']);
    vi.mocked(estadisticaService.exportarFrecuencias).mockResolvedValue(blob);
    renderizar();
    await screen.findByText('[8-10]');
    await userEvent.selectOptions(screen.getByLabelText('Variable'), 'diasParaParche');
    await userEvent.type(screen.getByLabelText('Número de intervalos'), '6');
    await waitFor(() =>
      expect(estadisticaService.obtenerFrecuenciasAgrupadas).toHaveBeenLastCalledWith({ variable: 'diasParaParche', numeroDeIntervalos: 6 })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar a Excel' })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: 'Exportar a Excel' }));

    await waitFor(() => expect(descargarArchivo).toHaveBeenCalledWith(blob, 'distribucion-de-frecuencias-diasParaParche.xlsx'));
    expect(estadisticaService.exportarFrecuencias).toHaveBeenCalledWith('agrupada', { variable: 'diasParaParche', numeroDeIntervalos: 6 });
  });

  test('sin datos para la variable: estado vacío con enlace a importar, y exportar queda inhabilitado', async () => {
    vi.mocked(estadisticaService.obtenerFrecuenciasAgrupadas).mockRejectedValue(new HttpError(400, 'La lista de Días para Parche no puede estar vacía'));
    renderizar();

    await userEvent.selectOptions(screen.getByLabelText('Variable'), 'diasParaParche');

    expect(await screen.findByText(/Ninguna vulnerabilidad cargada tiene un valor de «Días para parche»/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importá un dataset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar a Excel' })).toBeDisabled();
  });
});
