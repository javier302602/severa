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

// Dropdown de software (2026-07-20): catálogo real del analista, para el
// selector de "Comparación por software" en vez de un campo de texto libre.
export function useSoftwareDisponible() {
  return useQuery({
    queryKey: ['comparacion', 'software-disponible'],
    queryFn: comparacionService.listarSoftwareDisponible
  });
}
