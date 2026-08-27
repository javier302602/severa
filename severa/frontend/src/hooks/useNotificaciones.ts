import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionService } from '../api/notificacionService';
import { useAuth } from './useAuth';

const CLAVE_NOTIFICACIONES = ['notificaciones'] as const;

export function useNotificaciones() {
  const { analista } = useAuth();

  return useQuery({
    queryKey: CLAVE_NOTIFICACIONES,
    queryFn: notificacionService.listar,
    // Sin esto, la query dispararía en páginas públicas (login/registro) sin
    // token, el backend respondería 401 y el interceptor forzaría un logout
    // antes incluso de haber iniciado sesión.
    enabled: analista !== null,
    refetchInterval: 60_000
  });
}

export function useMarcarNotificacionLeida() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificacionService.marcarComoLeida(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES })
  });
}

// "Marcar todas como leídas" (2026-07-19).
export function useMarcarTodasLasNotificacionesLeidas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificacionService.marcarTodasComoLeidas(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES })
  });
}

// "Eliminar seleccionadas" (2026-07-20).
export function useEliminarNotificaciones() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => notificacionService.eliminarVarias(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES })
  });
}
