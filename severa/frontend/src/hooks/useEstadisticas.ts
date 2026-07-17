import { useQuery } from '@tanstack/react-query';
import { estadisticaService } from '../api/estadisticaService';

export function useResumenEstadistico() {
  return useQuery({ queryKey: ['estadisticas', 'resumen'], queryFn: estadisticaService.obtenerResumen });
}

export function useFrecuenciasAgrupadas() {
  return useQuery({ queryKey: ['estadisticas', 'frecuencias', 'agrupada'], queryFn: estadisticaService.obtenerFrecuenciasAgrupadas });
}

export function useFrecuenciasSinAgrupar() {
  return useQuery({ queryKey: ['estadisticas', 'frecuencias', 'sinAgrupar'], queryFn: estadisticaService.obtenerFrecuenciasSinAgrupar });
}
