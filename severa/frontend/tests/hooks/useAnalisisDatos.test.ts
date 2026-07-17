import { describe, test, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useAnalizarDataset,
  useEstadisticasDescriptivas,
  useAnalisisUnivariado,
  useMatrizCorrelacion,
  useOutliersDataset
} from '../../src/hooks/useAnalisisDatos';
import { analisisDatosService } from '../../src/api/analisisDatosService';
import { EnvoltorioQuery } from '../testUtils';

vi.mock('../../src/api/analisisDatosService', () => ({
  analisisDatosService: {
    analizar: vi.fn(),
    obtenerEstadisticasDescriptivas: vi.fn(),
    obtenerAnalisisUnivariado: vi.fn(),
    obtenerMatrizCorrelacion: vi.fn(),
    obtenerOutliers: vi.fn()
  }
}));

describe('useAnalisisDatos', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('useAnalizarDataset: llama a analisisDatosService.analizar con el archivo recibido', async () => {
    const archivo = new File(['contenido'], 'ventas.csv', { type: 'text/csv' });
    vi.mocked(analisisDatosService.analizar).mockResolvedValue({
      totalFilas: 1,
      filasDuplicadas: 0,
      columnas: [],
      sesionId: 'sesion-1'
    });

    const { result } = renderHook(() => useAnalizarDataset(), { wrapper: EnvoltorioQuery });
    result.current.mutate(archivo);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(analisisDatosService.analizar).toHaveBeenCalledWith(archivo);
    expect(result.current.data?.sesionId).toBe('sesion-1');
  });

  test('useEstadisticasDescriptivas: con sesionId null, no llama al service (enabled:false)', () => {
    const { result } = renderHook(() => useEstadisticasDescriptivas(null), { wrapper: EnvoltorioQuery });

    expect(result.current.fetchStatus).toBe('idle');
    expect(analisisDatosService.obtenerEstadisticasDescriptivas).not.toHaveBeenCalled();
  });

  test('useEstadisticasDescriptivas: con sesionId, llama al service con ese id', async () => {
    vi.mocked(analisisDatosService.obtenerEstadisticasDescriptivas).mockResolvedValue({ columnas: [] });

    const { result } = renderHook(() => useEstadisticasDescriptivas('sesion-1'), { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(analisisDatosService.obtenerEstadisticasDescriptivas).toHaveBeenCalledWith('sesion-1');
  });

  test('useAnalisisUnivariado: sin columna elegida, no llama al service aunque haya sesionId', () => {
    const { result } = renderHook(() => useAnalisisUnivariado('sesion-1', null), { wrapper: EnvoltorioQuery });

    expect(result.current.fetchStatus).toBe('idle');
    expect(analisisDatosService.obtenerAnalisisUnivariado).not.toHaveBeenCalled();
  });

  test('useAnalisisUnivariado: con sesionId y columna, llama al service con ambos', async () => {
    vi.mocked(analisisDatosService.obtenerAnalisisUnivariado).mockResolvedValue({
      tipo: 'numerica',
      nombre: 'Precio',
      valoresValidos: 1,
      valoresFaltantes: 0,
      resumenCincoNumeros: { minimo: 1, q1: 1, mediana: 1, q3: 1, maximo: 1, media: 1 },
      moda: [1],
      varianza: null,
      desviacionEstandar: null,
      coeficienteVariacion: null,
      distribucion: []
    });

    const { result } = renderHook(() => useAnalisisUnivariado('sesion-1', 'Precio'), { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(analisisDatosService.obtenerAnalisisUnivariado).toHaveBeenCalledWith('sesion-1', 'Precio');
  });

  test('useMatrizCorrelacion y useOutliersDataset: cada uno llama a su propio endpoint con el sesionId', async () => {
    vi.mocked(analisisDatosService.obtenerMatrizCorrelacion).mockResolvedValue({ columnas: [], filas: [], columnasExcluidas: [] });
    vi.mocked(analisisDatosService.obtenerOutliers).mockResolvedValue({ columnas: [], columnasExcluidas: [] });

    const { result: correlacion } = renderHook(() => useMatrizCorrelacion('sesion-9'), { wrapper: EnvoltorioQuery });
    const { result: outliers } = renderHook(() => useOutliersDataset('sesion-9'), { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(correlacion.current.isSuccess).toBe(true));
    await waitFor(() => expect(outliers.current.isSuccess).toBe(true));

    expect(analisisDatosService.obtenerMatrizCorrelacion).toHaveBeenCalledWith('sesion-9');
    expect(analisisDatosService.obtenerOutliers).toHaveBeenCalledWith('sesion-9');
  });
});
