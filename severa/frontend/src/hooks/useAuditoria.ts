import { useQuery } from '@tanstack/react-query';
import { auditoriaService } from '../api/auditoriaService';

export function useAuditoria() {
  return useQuery({ queryKey: ['auditoria'], queryFn: auditoriaService.listar });
}
