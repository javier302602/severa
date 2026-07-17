import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CorrelacionSeccion } from '../../../src/pages/analisis-datos/CorrelacionSeccion';
import { analisisDatosService } from '../../../src/api/analisisDatosService';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { obtenerMatrizCorrelacion: vi.fn() }
}));

describe('CorrelacionSeccion', () => {
  afterEach(() => vi.clearAllMocks());

  test('renderiza una celda por par de columnas, con el valor de r y color según el signo', async () => {
    vi.mocked(analisisDatosService.obtenerMatrizCorrelacion).mockResolvedValue({
      columnas: ['Precio', 'Cantidad'],
      filas: [
        { columna: 'Precio', correlaciones: [{ columna: 'Precio', valor: 1 }, { columna: 'Cantidad', valor: -0.33 }] },
        { columna: 'Cantidad', correlaciones: [{ columna: 'Precio', valor: -0.33 }, { columna: 'Cantidad', valor: 1 }] }
      ],
      columnasExcluidas: [{ nombre: 'Producto', motivo: 'La columna no es numérica' }]
    });

    render(<CorrelacionSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(screen.getAllByText('1.00')).toHaveLength(2));
    expect(screen.getAllByText('-0.33')).toHaveLength(2);
    expect(screen.getByText(/Producto/)).toBeInTheDocument();
    expect(screen.getByText(/La columna no es numérica/)).toBeInTheDocument();
  });

  test('celda sin datos suficientes (valor null): muestra "N/D" con el motivo en el title', async () => {
    vi.mocked(analisisDatosService.obtenerMatrizCorrelacion).mockResolvedValue({
      columnas: ['A', 'B'],
      filas: [
        { columna: 'A', correlaciones: [{ columna: 'A', valor: 1 }, { columna: 'B', valor: null, motivo: 'sin pares' }] },
        { columna: 'B', correlaciones: [{ columna: 'A', valor: null, motivo: 'sin pares' }, { columna: 'B', valor: 1 }] }
      ],
      columnasExcluidas: []
    });

    render(<CorrelacionSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    const celdas = await screen.findAllByText('N/D');
    expect(celdas).toHaveLength(2);
    expect(celdas[0].closest('td')).toHaveAttribute('title', 'sin pares');
  });

  test('sin columnas numéricas elegibles: muestra el estado vacío, no una tabla vacía', async () => {
    vi.mocked(analisisDatosService.obtenerMatrizCorrelacion).mockResolvedValue({ columnas: [], filas: [], columnasExcluidas: [] });

    render(<CorrelacionSeccion sesionId="sesion-1" onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    expect(await screen.findByText(/No hay al menos dos columnas numéricas/)).toBeInTheDocument();
  });
});
