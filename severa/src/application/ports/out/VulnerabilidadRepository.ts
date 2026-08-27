import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { EstadoRemediacion } from '../../../domain/value-objects/EstadoRemediacion';
import { FiltroVulnerabilidad } from '../../../domain/value-objects/FiltroVulnerabilidad';

// Paginación (2026-07-19): opcional para no romper a ExportarBusquedaFiltrada,
// que necesita TODAS las filas para el CSV — solo la búsqueda para pantalla
// (BuscarConFiltros/BusquedaController) la pasa, para no traer/renderizar
// decenas de miles de filas de una sola vez sobre un dataset grande.
export interface Paginacion {
  limite: number;
  offset: number;
}

// Multi-tenancy a nivel de dueño: cada método recibe analistaId y filtra por
// él en el SQL (WHERE analista_id = $N) — nunca se devuelve ni se modifica
// una fila que no pertenezca al analista que hace la llamada. analistaId
// SIEMPRE debe venir de req.analistaAutenticado.id en el controller (token
// verificado), nunca de query/body — el mismo criterio IDOR que ya usa
// filtros_favoritos/notificaciones desde los Sprints 11/13.
//
// Decisión de diseño confirmada: analistaId vive TANTO como campo de la
// entidad Vulnerabilidad (es un dato real del registro: quién es su dueño,
// no un detalle de infraestructura — permite validar ownership en la capa
// de aplicación sin depender de que el repositorio ya haya filtrado bien)
// CUANTO como parámetro explícito en los métodos de consulta/modificación
// de este puerto (no hay forma de armar un WHERE en SQL sin pasarlo). La
// excepción es guardar(): no recibe analistaId aparte, usa el que ya trae
// la entidad (ver Vulnerabilidad.asignarAnalista()).
export interface VulnerabilidadRepository {
  guardar(vulnerabilidad: Vulnerabilidad): Promise<void>;
  // Inserción real por lotes (2026-07-17, importación de datasets grandes):
  // UN solo INSERT multi-VALUES por lote, no N llamadas a guardar() — a
  // diferencia de esa, que hace un round-trip a la base por fila (costoso a
  // partir de cientos de miles de filas). Mismo contrato de upsert que
  // guardar() (ON CONFLICT (analista_id, cve) DO UPDATE). El llamador decide
  // el tamaño del lote (ver ImportarDataset.ts/ImportarDatasetDesdeUrl.ts).
  guardarLote(vulnerabilidades: Vulnerabilidad[]): Promise<void>;
  contar(analistaId: string): Promise<number>;
  listar(analistaId: string): Promise<Vulnerabilidad[]>;
  buscarPorCve(cve: string, analistaId: string): Promise<Vulnerabilidad | null>;
  filtrarPorRangoCvss(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]>;
  filtrarPorSeveridad(severidad: string, analistaId: string): Promise<Vulnerabilidad[]>;
  listarPorTipoAcceso(tipoAcceso: 'Remoto' | 'Local', analistaId: string): Promise<Vulnerabilidad[]>;
  listarPorTipoVulnerabilidad(tipoVulnerabilidad: string, analistaId: string): Promise<Vulnerabilidad[]>;
  listarPorSoftware(software: string, analistaId: string): Promise<Vulnerabilidad[]>;
  // "Comparación por software": lista de valores reales (no hardcodeados)
  // para poblar el dropdown en vez de que el analista tenga que adivinar
  // cómo está escrito el software en su propio catálogo — bug real
  // reportado: comparar "Apache Log4j" (tal cual lo escribe el usuario) vs.
  // "Nginx" devolvía "sin datos" para ambos si el dataset real los tenía
  // escritos distinto (ej. minúsculas, con/sin versión).
  listarSoftwareDisponible(analistaId: string): Promise<string[]>;
  actualizarEstado(cve: string, estado: EstadoRemediacion, analistaId: string, fechaRemediacion?: Date): Promise<void>;
  // RF-88: combina en una sola consulta todos los criterios presentes en el filtro.
  buscarConFiltros(filtro: FiltroVulnerabilidad, analistaId: string, paginacion?: Paginacion): Promise<Vulnerabilidad[]>;
  // "Restablecer mis datos": borra SOLO las vulnerabilidades del analista que
  // la invoca — nunca el catálogo completo de todos los analistas (ver
  // ReiniciarDataset.ts). Devuelve cuántas filas propias existían antes del
  // borrado (no un booleano) porque ese número es exactamente lo que
  // necesita el registro de auditoría.
  eliminarTodas(analistaId: string): Promise<number>;
}
