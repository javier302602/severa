import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstadisticasDescriptivasSeccion } from '../../../src/pages/analisis-datos/EstadisticasDescriptivasSeccion';
import { analisisDatosService } from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { obtenerEstadisticasDescriptivas: vi.fn() }
}));

describe('EstadisticasDescriptivasSeccion', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra el resumen de cada columna según su tipo', async () => {
    vi.mocked(analisisDatosService.obtenerEstadisticasDescriptivas).mockResolvedValue({
      columnas: [
        { tipo: 'numerica', nombre: 'Precio', valoresValidos: 5, media: 100, mediana: 90, moda: [90], minimo: 10, maximo: 200, q1: 50, q3: 150, rango: 190, varianza: 10, desviacionEstandar: 3.16 },
        { tipo: 'categorica', nombre: 'Categoria', valoresValidos: 5, valoresUnicos: 2, masFrecuente: [{ valor: 'Electronica', frecuencia: 3 }] }
      ]
    });

    render(<EstadisticasDescriptivasSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByText('Precio')).toBeInTheDocument());
    expect(screen.getByText('Categoria')).toBeInTheDocument();
    expect(screen.getByText(/más frecuente: "Electronica"/)).toBeInTheDocument();
  });

  test('sesión expirada (404): muestra el aviso con botón para reiniciar, no un error genérico', async () => {
    vi.mocked(analisisDatosService.obtenerEstadisticasDescriptivas).mockRejectedValue(
      new HttpError(404, 'Sesión de análisis no encontrada o expirada, volvé a subir el archivo')
    );
    const onReiniciar = vi.fn();

    render(<EstadisticasDescriptivasSeccion sesionId="sesion-vieja" onReiniciar={onReiniciar} />, { wrapper: EnvoltorioQuery });

    const boton = await screen.findByRole('button', { name: 'Subir otro archivo' });
    expect(screen.getByText(/expiró o no se encontró/)).toBeInTheDocument();

    await userEvent.click(boton);
    expect(onReiniciar).toHaveBeenCalledTimes(1);
  });
});
