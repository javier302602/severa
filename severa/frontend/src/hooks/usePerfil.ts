import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { perfilService, type DatosEdicionPerfil } from '../api/perfilService';
import { useAuth } from './useAuth';

const CLAVE_PERFIL = ['perfil'] as const;

export function usePerfil() {
  const { analista } = useAuth();

  return useQuery({
    queryKey: CLAVE_PERFIL,
    queryFn: perfilService.obtener,
    enabled: analista !== null
  });
}

export function useEditarPerfil() {
  const queryClient = useQueryClient();
  const { actualizarAnalista } = useAuth();

  return useMutation({
    mutationFn: (datos: DatosEdicionPerfil) => perfilService.editar(datos),
    onSuccess: (analistaActualizado) => {
      queryClient.setQueryData(CLAVE_PERFIL, analistaActualizado);
      actualizarAnalista(analistaActualizado);
    }
  });
}

// RF-11. Una página del historial de análisis (la 0 es la más reciente).
export function useHistorialDeAnalisis(pagina = 0) {
  const { analista } = useAuth();

  return useQuery({
    queryKey: ['historial-de-analisis', pagina],
    queryFn: () => perfilService.listarHistorial(pagina),
    enabled: analista !== null,
    placeholderData: keepPreviousData
  });
}

// RF-14. Es una mutación y no una consulta: descarga un archivo cuando el
// analista lo pide, no hay nada que mantener al día en pantalla.
export function useExportarHistorial() {
  return useMutation({ mutationFn: () => perfilService.exportarHistorial() });
}
