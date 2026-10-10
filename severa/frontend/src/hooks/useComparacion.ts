import { useQuery } from '@tanstack/react-query';
import { comparacionService, type VariableDeAgrupacion, type VariableDeValor } from '../api/comparacionService';

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

// Bajo la clave ['comparacion', …]: al cambiar la escala de niveles de riesgo
// se vuelve a pedir (ver useEscalaDeClasificacion).
export function useComparacionPorCategoria(variableAgrupacion: VariableDeAgrupacion, variableValor: VariableDeValor) {
  return useQuery({
    queryKey: ['comparacion', 'por-categoria', variableAgrupacion, variableValor],
    queryFn: () => comparacionService.compararPorCategoria(variableAgrupacion, variableValor)
  });
}
