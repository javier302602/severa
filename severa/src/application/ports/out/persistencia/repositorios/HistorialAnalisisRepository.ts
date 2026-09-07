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
  listarPorAnalista(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]>;
}
