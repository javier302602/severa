import { useQuery } from '@tanstack/react-query';
import { comparacionService } from '../api/comparacionService';

export function useComparacionAcceso() {
  return useQuery({ queryKey: ['comparacion', 'acceso'], queryFn: comparacionService.compararAcceso });
}

// categoriaA/categoriaB viajan en la queryKey: cambiar cualquiera de las dos
// dispara un nuevo fetch, igual que si fuera un filtro de búsqueda.
export function useComparacionTipo(categoriaA: string, categoriaB: string) {
  return useQuery({
    queryKey: ['comparacion', 'tipo', categoriaA, categoriaB],
    queryFn: () => comparacionService.compararTipo(categoriaA, categoriaB)
  });
}

export function useComparacionSoftware(categoriaA: string, categoriaB: string) {
  return useQuery({
    queryKey: ['comparacion', 'software', categoriaA, categoriaB],
    queryFn: () => comparacionService.compararSoftware(categoriaA, categoriaB)
  });
}
