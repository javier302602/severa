import { useQuery } from '@tanstack/react-query';
import { vulnerabilidadService } from '../api/vulnerabilidadService';

export function useVulnerabilidad(cve: string) {
  return useQuery({
    queryKey: ['catalogo', 'detalle', cve],
    queryFn: () => vulnerabilidadService.obtenerPorCve(cve)
  });
}
