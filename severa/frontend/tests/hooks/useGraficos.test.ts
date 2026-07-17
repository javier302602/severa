import { describe, test, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGrafico } from '../../src/hooks/useGraficos';
import { graficoService } from '../../src/api/graficoService';
import { EnvoltorioQuery } from '../testUtils';

// Mockea el service (graficoService), no httpClient — mismo criterio pedido:
// un test de hook debe probar que el hook llama al service correcto con los
// argumentos correctos y expone el estado de React Query, sin acoplarse a
// fetch/axios ni a la red real. Contrato actualizado: el service devuelve
// { svg, interpretacion } (Mejora "interpretación en prosa en Gráficos").
vi.mock('../../src/api/graficoService', () => ({
  graficoService: { obtener: vi.fn() }
}));

describe('useGrafico', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('llama a graficoService.obtener con el tipo y límite pedidos, y expone { svg, interpretacion } como data', async () => {
    vi.mocked(graficoService.obtener).mockResolvedValue({ svg: '<svg>real</svg>', interpretacion: 'texto real' });

    const { result } = renderHook(() => useGrafico('topSoftware', 10), { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(graficoService.obtener).toHaveBeenCalledWith('topSoftware', 10);
    expect(result.current.data).toEqual({ svg: '<svg>real</svg>', interpretacion: 'texto real' });
  });

  test('sin límite, lo llama con undefined (no lo inventa)', async () => {
    vi.mocked(graficoService.obtener).mockResolvedValue({ svg: '<svg/>', interpretacion: '' });

    const { result } = renderHook(() => useGrafico('histogramaCvss'), { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(graficoService.obtener).toHaveBeenCalledWith('histogramaCvss', undefined);
  });

  test('cuando el service rechaza, expone isError y el error tal cual', async () => {
    const error = new Error('400: catálogo vacío');
    vi.mocked(graficoService.obtener).mockRejectedValue(error);

    const { result } = renderHook(() => useGrafico('boxplotCvss'), { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});
