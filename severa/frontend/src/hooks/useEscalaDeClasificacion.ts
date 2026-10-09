import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { escalaService, type CortesDeClasificacion, type EscalaDeClasificacion } from '../api/escalaService';

export const CLAVE_ESCALA = ['escala-clasificacion'] as const;

// Todo lo que muestra o filtra por nivel de riesgo se calcula con la escala
// del analista: al cambiarla, se vuelve a pedir. Catálogo y búsqueda
// (['catalogo', …]), gráficos, comparación, ranking, estadísticas
// (la interpretación nombra el nivel promedio) e informes.
const CLAVES_QUE_DEPENDEN_DE_LA_ESCALA = [['catalogo'], ['graficos'], ['comparacion'], ['priorizacion'], ['estadisticas'], ['informes']];

function alCambiarLaEscala(queryClient: QueryClient, escala: EscalaDeClasificacion) {
  queryClient.setQueryData(CLAVE_ESCALA, escala);
  for (const queryKey of CLAVES_QUE_DEPENDEN_DE_LA_ESCALA) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function useEscalaDeClasificacion() {
  return useQuery({ queryKey: CLAVE_ESCALA, queryFn: escalaService.obtener });
}

export function useGuardarEscala() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cortes: CortesDeClasificacion) => escalaService.guardar(cortes),
    onSuccess: (escala) => alCambiarLaEscala(queryClient, escala)
  });
}

export function useVolverAEscalaCvss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: escalaService.volverACvss,
    onSuccess: (escala) => alCambiarLaEscala(queryClient, escala)
  });
}
