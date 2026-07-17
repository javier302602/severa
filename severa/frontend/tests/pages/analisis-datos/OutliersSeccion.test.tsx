import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OutliersSeccion } from '../../../src/pages/analisis-datos/OutliersSeccion';
import { analisisDatosService } from '../../../src/api/analisisDatosService';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { obtenerOutliers: vi.fn() }
}));

describe('OutliersSeccion', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra la fila de la tabla resumen y el detalle de valores atípicos por columna', async () => {
    vi.mocked(analisisDatosService.obtenerOutliers).mockResolvedValue({
      columnas: [
        {
          columna: 'Precio',
          q1: 65,
          q3: 375,
          rangoIntercuartilico: 310,
          limiteInferior: -400,
          limiteSuperior: 840,
          cantidadValoresAtipicos: 2,
          valoresAtipicos: [
            { filaIndice: 0, valor: 1200 },
            { filaIndice: 10, valor: 9500 }
          ]
        }
      ],
      columnasExcluidas: [{ nombre: 'Producto', motivo: 'La columna no es numérica' }]
    });

    render(<OutliersSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByText('Precio')).toBeInTheDocument());
    expect(screen.getByText(/2 valor\(es\) atípico\(s\)/)).toBeInTheDocument();
    // filaIndice es 0-based en la API, se muestra 1-based ("fila 1", "fila 11").
    expect(screen.getByText(/fila 1: 1200/)).toBeInTheDocument();
    expect(screen.getByText(/fila 11: 9500/)).toBeInTheDocument();
    expect(screen.getByText(/Producto/)).toBeInTheDocument();
  });

  test('sin columnas numéricas evaluables: muestra el estado vacío', async () => {
    vi.mocked(analisisDatosService.obtenerOutliers).mockResolvedValue({ columnas: [], columnasExcluidas: [] });

    render(<OutliersSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText(/No hay columnas numéricas con datos suficientes/)).toBeInTheDocument();
  });

  test('columna sin atípicos: no muestra la tarjeta de detalle para esa columna', async () => {
    vi.mocked(analisisDatosService.obtenerOutliers).mockResolvedValue({
      columnas: [
        { columna: 'Descuento', q1: 1, q3: 10, rangoIntercuartilico: 9, limiteInferior: -12.5, limiteSuperior: 23.5, cantidadValoresAtipicos: 0, valoresAtipicos: [] }
      ],
      columnasExcluidas: []
    });

    render(<OutliersSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getByText('Descuento')).toBeInTheDocument());
    expect(screen.queryByText(/valor\(es\) atípico\(s\)/)).not.toBeInTheDocument();
  });
});
