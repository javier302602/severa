import { httpClient } from './httpClient';
import type { CriteriosBusqueda } from './busquedaService';

// Contrato verificado contra BusquedaController.ts (POST/GET
// /filtros-favoritos). analistaId SIEMPRE sale de req.analistaAutenticado.id
// del lado del backend — nunca se manda desde acá, así que no forma parte
// del payload que arma este servicio.
export interface FiltroFavorito {
  id: string;
  analistaId: string;
  nombre: string;
  criterios: CriteriosBusqueda;
  fechaCreacion: string;
}

export const filtroFavoritoService = {
  guardar: (nombre: string, criterios: CriteriosBusqueda): Promise<FiltroFavorito> =>
    httpClient.post('/filtros-favoritos', { nombre, criterios }),
  listar: (): Promise<FiltroFavorito[]> => httpClient.get('/filtros-favoritos')
};
