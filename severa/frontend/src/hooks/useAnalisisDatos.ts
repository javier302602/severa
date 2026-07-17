import { useMutation, useQuery } from '@tanstack/react-query';
import { analisisDatosService, type FormatoInformeDataset } from '../api/analisisDatosService';

// Mejora 4 (Análisis de Datos General) — Fase 6. sesionId vive en el estado
// del componente (AnalisisDatosPage), no en localStorage ni en la query key
// de forma persistida entre sesiones de navegador: expira a los 30 minutos
// del lado del backend (SesionAnalisisStoreEnMemoria.ts) y no tiene sentido
// sobrevivir a un refresh de la página.
export function useAnalizarDataset() {
  return useMutation({
    mutationFn: (archivo: File) => analisisDatosService.analizar(archivo)
  });
}

export function useEstadisticasDescriptivas(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'estadisticas-descriptivas'],
    queryFn: () => analisisDatosService.obtenerEstadisticasDescriptivas(sesionId!),
    enabled: sesionId !== null
  });
}

export function useAnalisisUnivariado(sesionId: string | null, columna: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'univariado', columna],
    queryFn: () => analisisDatosService.obtenerAnalisisUnivariado(sesionId!, columna!),
    enabled: sesionId !== null && columna !== null
  });
}

export function useMatrizCorrelacion(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'correlacion'],
    queryFn: () => analisisDatosService.obtenerMatrizCorrelacion(sesionId!),
    enabled: sesionId !== null
  });
}

export function useOutliersDataset(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'outliers'],
    queryFn: () => analisisDatosService.obtenerOutliers(sesionId!),
    enabled: sesionId !== null
  });
}

export function useDescargarInformeDataset() {
  return useMutation({
    mutationFn: ({ sesionId, formato }: { sesionId: string; formato: FormatoInformeDataset }) =>
      analisisDatosService.descargarInforme(sesionId, formato)
  });
}
