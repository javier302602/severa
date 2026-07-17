import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
