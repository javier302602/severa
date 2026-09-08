import { FiltroFavorito } from '../../../../../domain/entities/FiltroFavorito';

export interface FiltroFavoritoRepository {
  guardar(filtroFavorito: FiltroFavorito): Promise<void>;
  listarPorAnalista(analistaId: string): Promise<FiltroFavorito[]>;
  // true si existía y era del analista (se eliminó); false si no existe o es
  // de otro analista — mismo criterio que VulnerabilidadRepository.eliminarTodas
  // (el llamador decide qué código HTTP corresponde, el repositorio solo
  // informa si de verdad borró algo).
  eliminar(id: string, analistaId: string): Promise<boolean>;
}
