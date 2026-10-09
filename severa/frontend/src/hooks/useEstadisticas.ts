import { useMutation, useQuery } from '@tanstack/react-query';
import { estadisticaService, type ConsultaDeFrecuencias } from '../api/estadisticaService';

export function useResumenEstadistico() {
  return useQuery({ queryKey: ['estadisticas', 'resumen'], queryFn: estadisticaService.obtenerResumen });
}

// La consulta (variable y número de intervalos) forma parte de la clave: cada
// combinación se pide y se cachea por separado.
export function useFrecuenciasAgrupadas(consulta: ConsultaDeFrecuencias, habilitada = true) {
  return useQuery({
    queryKey: ['estadisticas', 'frecuencias', 'agrupada', consulta.variable, consulta.numeroDeIntervalos ?? 'automatico'],
    queryFn: () => estadisticaService.obtenerFrecuenciasAgrupadas(consulta),
    enabled: habilitada
  });
}

export function useFrecuenciasSinAgrupar(consulta: ConsultaDeFrecuencias, habilitada = true) {
  return useQuery({
    queryKey: ['estadisticas', 'frecuencias', 'sinAgrupar', consulta.variable],
    queryFn: () => estadisticaService.obtenerFrecuenciasSinAgrupar(consulta),
    enabled: habilitada
  });
}

export function useExportarFrecuencias() {
  return useMutation({
    mutationFn: ({ tipo, consulta }: { tipo: 'agrupada' | 'sinAgrupar'; consulta: ConsultaDeFrecuencias }) =>
      estadisticaService.exportarFrecuencias(tipo, consulta)
  });
}
