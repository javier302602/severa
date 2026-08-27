import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { busquedaService, TAMANO_PAGINA, type CriteriosBusqueda } from '../api/busquedaService';
import { filtroFavoritoService } from '../api/filtroFavoritoService';

// `criterios === null` significa "todavía no se envió el formulario" — la
// query queda deshabilitada (no hay endpoint de "listar todo", ver huecos
// reportados), en vez de disparar una búsqueda vacía que el backend
// rechazaría con FiltroVacioError.
//
// Paginación (2026-07-19): useInfiniteQuery en vez de useQuery — reutilizado
// por CatalogoPage y BusquedaAvanzadaPage (mismo hook, sin duplicar lógica de
// "cargar más"). Cada página nueva se guarda por separado; se pide la
// siguiente solo si la última trajo una página completa (TAMANO_PAGINA
// filas) — si trajo menos, ya no hay más resultados.
export function useBuscarVulnerabilidades(criterios: CriteriosBusqueda | null) {
  return useInfiniteQuery({
    queryKey: ['catalogo', 'buscar', criterios],
    queryFn: ({ pageParam }) => busquedaService.buscar(criterios as CriteriosBusqueda, pageParam),
    initialPageParam: 1,
    getNextPageParam: (ultimaPagina, todasLasPaginas) =>
      ultimaPagina.length === TAMANO_PAGINA ? todasLasPaginas.length + 1 : undefined,
    enabled: criterios !== null
  });
}

// M-11: exportar es una acción bajo demanda (botón), no algo que se cachee
// como una query — de ahí useMutation en vez de useQuery, igual que las
// descargas de InformeService.
export function useExportarBusqueda() {
  return useMutation({
    mutationFn: (criterios: CriteriosBusqueda) => busquedaService.exportar(criterios)
  });
}

export function useFiltrosFavoritos() {
  return useQuery({ queryKey: ['filtrosFavoritos'], queryFn: filtroFavoritoService.listar });
}

export function useGuardarFiltroFavorito() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ nombre, criterios }: { nombre: string; criterios: CriteriosBusqueda }) =>
      filtroFavoritoService.guardar(nombre, criterios),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['filtrosFavoritos'] })
  });
}
