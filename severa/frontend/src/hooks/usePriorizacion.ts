import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { priorizacionService, type SeveridadFiltro } from '../api/priorizacionService';

const CLAVE_RANKING = ['priorizacion', 'ranking'] as const;

// severidad en la queryKey (2026-07-19, "carga por etapas"): cada severidad
// es su propia entrada de caché — cambiar de pestaña no vuelve a pedir algo
// que ya se cargó, y cada una tiene su propio estado de isLoading
// independiente (no bloquea a las demás mientras carga una).
export function useRanking(severidad?: SeveridadFiltro) {
  return useQuery({
    queryKey: [...CLAVE_RANKING, severidad ?? 'todas'],
    queryFn: () => priorizacionService.obtenerRanking(severidad)
  });
}

export function useMarcarEstado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cve, estado }: { cve: string; estado: 'EnProceso' | 'Remediada' }) =>
      priorizacionService.marcarEstado(cve, estado),
    // invalidateQueries con solo el prefijo (sin la severidad) invalida
    // TODAS las pestañas cacheadas — la vulnerabilidad recién movida de
    // estado puede afectar el orden/contenido de cualquiera de ellas.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_RANKING })
  });
}
