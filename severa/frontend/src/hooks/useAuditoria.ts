import { useQuery } from '@tanstack/react-query';
import { auditoriaService } from '../api/auditoriaService';

// RF-138: `datasetId` (opcional) acota la consulta a un dataset.
export function useAuditoria(datasetId: string | null = null) {
  return useQuery({
    queryKey: ['auditoria', datasetId],
    queryFn: () => auditoriaService.listar(datasetId ?? undefined)
  });
}
