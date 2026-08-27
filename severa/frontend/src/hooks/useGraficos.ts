import { useQuery } from '@tanstack/react-query';
import { graficoService, type TipoGrafico } from '../api/graficoService';

// Bug real reportado: un gráfico que fallaba solo mostraba "Failed to fetch"
// genérico, y uno que no respondía se quedaba cargando indefinidamente.
const TIMEOUT_MS = 30_000;

function esErrorDeTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function useGrafico(tipo: TipoGrafico, limite?: number) {
  return useQuery({
    queryKey: ['graficos', tipo, limite],
    queryFn: async () => {
      try {
        return await graficoService.obtener(tipo, limite, AbortSignal.timeout(TIMEOUT_MS));
      } catch (error) {
        // console.error específico (no solo dejar que React Query trague el
        // error): loguea el tipo de gráfico y el mensaje real para poder
        // diagnosticar cuál de los 10 falló y por qué, sin abrir el network tab.
        console.error(`[Gráfico "${tipo}"] falló:`, error instanceof Error ? error.message : error);

        if (esErrorDeTimeout(error)) {
          throw new Error('Gráfico tardó demasiado, intenta de nuevo');
        }
        throw error;
      }
    }
  });
}
