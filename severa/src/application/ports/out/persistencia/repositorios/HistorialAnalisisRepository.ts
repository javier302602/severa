import { AnalisisRealizado } from '../../../../../domain/entities/AnalisisRealizado';
import { Paginacion } from './VulnerabilidadRepository';

// Multi-tenancy a nivel de dueño, mismo criterio que FiltroFavoritoRepository/
// NotificacionRepository: listarPorAnalista SIEMPRE filtra por analistaId en
// el SQL — el llamador nunca debe pasar un id que no venga de
// req.analistaAutenticado.id (ver ObtenerHistorialAnalisis/PerfilController).
// Reutiliza el tipo Paginacion de VulnerabilidadRepository (mismo patrón ya
// usado por BuscarConFiltros/ExportarBusquedaFiltrada) en vez de definir uno
// propio.
export interface HistorialAnalisisRepository {
  registrar(analisis: AnalisisRealizado): Promise<void>;
  // Igual que `registrar`, pero si ya existe un evento con ese mismo id no
  // hace nada. Devuelve si lo guardó. Es lo que permite anotar "una sola vez"
  // con un id determinista (ver idDeAnalisisUnico) sin consultar antes.
  registrarSiEsNuevo(analisis: AnalisisRealizado): Promise<boolean>;
  // Del más reciente al más antiguo.
  listarPorAnalista(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]>;
  contarPorAnalista(analistaId: string): Promise<number>;
}
