import { useQuery } from '@tanstack/react-query';
import { graficoService, type TipoGrafico } from '../api/graficoService';

export function useGrafico(tipo: TipoGrafico, limite?: number) {
  return useQuery({
    queryKey: ['graficos', tipo, limite],
    queryFn: () => graficoService.obtener(tipo, limite)
  });
}
