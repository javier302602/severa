import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { priorizacionService } from '../api/priorizacionService';

const CLAVE_RANKING = ['priorizacion', 'ranking'] as const;

export function useRanking() {
  return useQuery({ queryKey: CLAVE_RANKING, queryFn: priorizacionService.obtenerRanking });
}

export function useMarcarEstado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cve, estado }: { cve: string; estado: 'EnProceso' | 'Remediada' }) =>
      priorizacionService.marcarEstado(cve, estado),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_RANKING })
  });
}
