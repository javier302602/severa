import { useMutation, useQueryClient } from '@tanstack/react-query';
import { datasetService, type MapeoColumnas } from '../api/datasetService';

function invalidarDependientesDelCatalogo(queryClient: ReturnType<typeof useQueryClient>): void {
  // Un dataset importado (por archivo o por link) cambia todo lo que
  // depende del catálogo.
  queryClient.invalidateQueries({ queryKey: ['catalogo'] });
  queryClient.invalidateQueries({ queryKey: ['estadisticas'] });
  queryClient.invalidateQueries({ queryKey: ['graficos'] });
  queryClient.invalidateQueries({ queryKey: ['priorizacion'] });
}

// Mapeo flexible de columnas: se llama apenas se elige el archivo, antes de
// mostrar el formulario de mapeo — no invalida ninguna query, no cambia nada
// todavía, solo lee headers.
export function useDetectarColumnas() {
  return useMutation({
    mutationFn: (archivo: File) => datasetService.detectarColumnas(archivo)
  });
}

export function useImportarDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ archivo, mapeoColumnas }: { archivo: File; mapeoColumnas?: MapeoColumnas }) =>
      datasetService.importar(archivo, mapeoColumnas),
    onSuccess: () => invalidarDependientesDelCatalogo(queryClient)
  });
}

export function useImportarDatasetDesdeUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (url: string) => datasetService.importarDesdeUrl(url),
    onSuccess: () => invalidarDependientesDelCatalogo(queryClient)
  });
}

// "Restablecer datos": mismas queries a invalidar que un import — el
// catálogo queda vacío, así que estadísticas/gráficos/priorización tienen
// que reflejar eso de inmediato, no seguir mostrando el estado anterior.
export function useReiniciarDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => datasetService.reiniciar(),
    onSuccess: () => invalidarDependientesDelCatalogo(queryClient)
  });
}

// Sección Informes: convierte un link a .xlsx descargable, sin tocar el
// catálogo — no invalida ninguna query (nada cambió en los datos de SEVERA).
export function useConvertirUrlAExcel() {
  return useMutation({
    mutationFn: (url: string) => datasetService.convertirUrlAExcel(url)
  });
}
