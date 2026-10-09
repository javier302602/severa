import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionService } from '../api/notificacionService';
import { useAuth } from './useAuth';

const CLAVE_NOTIFICACIONES = ['notificaciones'] as const;

// RF-103. Trae UNA página del centro de notificaciones (la 0 es la más
// reciente), junto con el total y la cantidad de no leídas de todo el centro.
// El contador del encabezado usa la página 0, la misma que abre la pantalla
// de notificaciones: comparten la consulta.
export function useNotificaciones(pagina = 0) {
  const { analista } = useAuth();

  return useQuery({
    queryKey: [...CLAVE_NOTIFICACIONES, pagina],
    queryFn: () => notificacionService.listar(pagina),
    // Sin esto, la query dispararía en páginas públicas (login/registro) sin
    // token, el backend respondería 401 y el interceptor forzaría un logout
    // antes incluso de haber iniciado sesión.
    enabled: analista !== null,
    refetchInterval: 60_000,
    // Al cambiar de página se sigue mostrando la anterior hasta que llega la
    // nueva, en vez de vaciar la lista y volver a dibujarla.
    placeholderData: keepPreviousData
  });
}

// Todas las mutaciones invalidan por el prefijo ['notificaciones']: se
// refresca la página que se esté viendo y el contador del encabezado.
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

// "Eliminar las leídas": vacía de una vez todo lo ya leído, de todas las
// páginas (RF-104).
export function useEliminarNotificacionesLeidas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificacionService.eliminarLeidas(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES })
  });
}
