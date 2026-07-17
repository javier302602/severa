import { Pool } from 'pg';
import { config } from './env';
import { PostgresAnalistaRepository } from '../adapters/out/persistence/PostgresAnalistaRepository';
import { PostgresVulnerabilidadRepository } from '../adapters/out/persistence/PostgresVulnerabilidadRepository';
import { PostgresFiltroFavoritoRepository } from '../adapters/out/persistence/PostgresFiltroFavoritoRepository';
import { PostgresAuditoriaRepository } from '../adapters/out/persistence/PostgresAuditoriaRepository';
import { PostgresNotificacionRepository } from '../adapters/out/persistence/PostgresNotificacionRepository';
import { BcryptHasher } from '../adapters/out/seguridad/BcryptHasher';
import { RegistrarAnalista } from '../../application/usecases/RegistrarAnalista';
import { IniciarSesion } from '../../application/usecases/IniciarSesion';
import { EditarPerfil } from '../../application/usecases/EditarPerfil';
import { VerPerfil } from '../../application/usecases/VerPerfil';
import { EliminarCuenta } from '../../application/usecases/EliminarCuenta';
import { ConsultarVulnerabilidadPorCVE } from '../../application/usecases/ConsultarVulnerabilidadPorCVE';
import { FiltrarPorRangoCvss } from '../../application/usecases/FiltrarPorRangoCvss';
import { FiltrarPorSeveridad } from '../../application/usecases/FiltrarPorSeveridad';
import { ImportarDataset } from '../../application/usecases/ImportarDataset';
import { SincronizarConApiNvd } from '../../application/usecases/SincronizarConApiNvd';
import { ExportarDatasetValidado } from '../../application/usecases/ExportarDatasetValidado';
import { CalcularResumenEstadistico } from '../../application/usecases/CalcularResumenEstadistico';
import { GenerarDistribucionFrecuencias } from '../../application/usecases/GenerarDistribucionFrecuencias';
import { LectorExcelDataset } from '../adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetDesdeArchivo } from '../../application/usecases/ImportarDatasetDesdeArchivo';
import { DetectarColumnasDataset } from '../../application/usecases/DetectarColumnasDataset';
import { ImportarDatasetDesdeUrl } from '../../application/usecases/ImportarDatasetDesdeUrl';
import { DescargadorDeArchivosHttp } from '../adapters/out/http/DescargadorDeArchivosHttp';
import { NvdApiClientHttp } from '../adapters/out/nvd/NvdApiClientHttp';
import { GenerarGrafico } from '../../application/usecases/GenerarGrafico';
import { SvgGraficosAdapter } from '../adapters/out/graphics/SvgGraficosAdapter';
import { CompararPorTipoAcceso } from '../../application/usecases/CompararPorTipoAcceso';
import { CompararPorTipoDeVulnerabilidad } from '../../application/usecases/CompararPorTipoDeVulnerabilidad';
import { CompararPorSoftware } from '../../application/usecases/CompararPorSoftware';
import { ClasificarRiesgo } from '../../application/usecases/ClasificarRiesgo';
import { GenerarRankingUrgencia } from '../../application/usecases/GenerarRankingUrgencia';
import { MarcarEnProcesoDeRemediacion } from '../../application/usecases/MarcarEnProcesoDeRemediacion';
import { MarcarComoRemediada } from '../../application/usecases/MarcarComoRemediada';
import { ConsolaServicioDeNotificaciones } from '../adapters/out/notificaciones/ConsolaServicioDeNotificaciones';
import { GenerarInforme } from '../../application/usecases/GenerarInforme';
import { GenerarResumenEjecutivo } from '../../application/usecases/GenerarResumenEjecutivo';
import { ProgramarInformePeriodico } from '../../application/usecases/ProgramarInformePeriodico';
import { NodeCronProgramadorDeTareas } from '../adapters/out/scheduler/NodeCronProgramadorDeTareas';
import { GeneradorInformePDF } from '../adapters/out/reportes/GeneradorInformePDF';
import { BuscarConFiltros } from '../../application/usecases/BuscarConFiltros';
import { GuardarFiltroFavorito } from '../../application/usecases/GuardarFiltroFavorito';
import { ListarFiltrosFavoritos } from '../../application/usecases/ListarFiltrosFavoritos';
import { ExportarBusquedaFiltrada } from '../../application/usecases/ExportarBusquedaFiltrada';
import { ConsultarAuditoria } from '../../application/usecases/ConsultarAuditoria';
import { ObtenerNotificaciones } from '../../application/usecases/ObtenerNotificaciones';
import { MarcarNotificacionLeida } from '../../application/usecases/MarcarNotificacionLeida';
import { IniciarSesionConAuditoria } from '../../application/usecases/auditoria/IniciarSesionConAuditoria';
import { ImportarDatasetConAuditoria } from '../../application/usecases/auditoria/ImportarDatasetConAuditoria';
import { MarcarEnProcesoDeRemediacionConAuditoria } from '../../application/usecases/auditoria/MarcarEnProcesoDeRemediacionConAuditoria';
import { MarcarComoRemediadaConAuditoria } from '../../application/usecases/auditoria/MarcarComoRemediadaConAuditoria';
import { GenerarInformeConAuditoria } from '../../application/usecases/auditoria/GenerarInformeConAuditoria';
import { GenerarResumenEjecutivoConAuditoria } from '../../application/usecases/auditoria/GenerarResumenEjecutivoConAuditoria';
import { LectorDatasetGenerico } from '../adapters/out/dataset-generico/LectorDatasetGenerico';
import { SesionAnalisisStoreEnMemoria } from '../adapters/out/dataset-generico/SesionAnalisisStoreEnMemoria';
import { AnalizarDatasetGenerico } from '../../application/usecases/AnalizarDatasetGenerico';
import { CalcularEstadisticasDescriptivasGenerico } from '../../application/usecases/CalcularEstadisticasDescriptivasGenerico';
import { AnalizarColumnaUnivariadoGenerico } from '../../application/usecases/AnalizarColumnaUnivariadoGenerico';
import { CalcularMatrizCorrelacionGenerico } from '../../application/usecases/CalcularMatrizCorrelacionGenerico';
import { DetectarOutliersGenerico } from '../../application/usecases/DetectarOutliersGenerico';
import { GenerarInformeDataset } from '../../application/usecases/GenerarInformeDataset';

const pool = new Pool({ connectionString: config.databaseUrl });
const analistaRepository = new PostgresAnalistaRepository(pool);
const vulnerabilidadRepository = new PostgresVulnerabilidadRepository(pool);
const filtroFavoritoRepository = new PostgresFiltroFavoritoRepository(pool);
const auditoriaRepository = new PostgresAuditoriaRepository(pool);
const notificacionRepository = new PostgresNotificacionRepository(pool);
const hasher = new BcryptHasher();
const lectorExcelDataset = new LectorExcelDataset();
const nvdApiClient = new NvdApiClientHttp();
const graficosOutputPort = new SvgGraficosAdapter();
// RF-99 a RF-102: único punto de emisión de notificaciones (consola + centro
// de notificaciones persistido), compartido por todos los casos de uso que
// disparan alertas.
const servicioDeNotificaciones = new ConsolaServicioDeNotificaciones(notificacionRepository);
const geradorDeInformes = new GeneradorInformePDF();
const programadorDeTareas = new NodeCronProgramadorDeTareas();
// Mejora 4 (Análisis de Datos General) — Fase 3: una sola instancia
// compartida entre `analizarDatasetGenericoUseCase` (quien crea la sesión) y
// los casos de uso de estadísticas/análisis univariado (quienes la leen) —
// si cada uno tuviera su propio store en memoria, ninguna sesión creada por
// el primero sería visible para los demás.
const sesionAnalisisStore = new SesionAnalisisStoreEnMemoria();
// Compartido entre `importarDatasetUseCase`, `sincronizarConApiNvdUseCase` e
// `importarDatasetDesdeArchivoUseCase` para que las TRES vías de cambio del
// dataset (carga manual por archivo, carga manual por resultado ya parseado,
// y sincronización con NVD) pasen por el mismo registro de auditoría (RF-94)
// y las mismas alertas de vulnerabilidad crítica (RF-99).
const importarDatasetConAuditoria = new ImportarDatasetConAuditoria(
  new ImportarDataset(vulnerabilidadRepository),
  auditoriaRepository,
  servicioDeNotificaciones
);
// Hoisteado (en vez de construirse inline dentro de `container`) porque
// `importarDatasetDesdeUrlUseCase` también lo necesita, para el caso de un
// link de NVD (delega en el mismo flujo de sincronización de siempre en vez
// de duplicar auditoría/notificación).
const sincronizarConApiNvdUseCase = new SincronizarConApiNvd(
  nvdApiClient,
  lectorExcelDataset,
  importarDatasetConAuditoria,
  servicioDeNotificaciones
);
const descargadorDeArchivos = new DescargadorDeArchivosHttp();
// Compartido entre `generarInformeUseCase` y `programarInformePeriodicoUseCase`
// para que un informe generado automáticamente por el cron quede auditado
// (RF-95) y notificado (RF-101) igual que uno pedido a mano.
const generarInformeConAuditoria = new GenerarInformeConAuditoria(
  new GenerarInforme(vulnerabilidadRepository, geradorDeInformes, auditoriaRepository),
  auditoriaRepository,
  servicioDeNotificaciones
);

export const container = {
  registrarAnalistaUseCase: new RegistrarAnalista(analistaRepository, hasher),
  // RF-94/95: decorado con auditoría — un login exitoso queda registrado sin
  // que AuthController tenga que saber que la auditoría existe.
  iniciarSesionUseCase: new IniciarSesionConAuditoria(
    new IniciarSesion(analistaRepository, hasher, config.jwtSecret),
    auditoriaRepository
  ),
  editarPerfilUseCase: new EditarPerfil(analistaRepository),
  verPerfilUseCase: new VerPerfil(analistaRepository),
  eliminarCuentaUseCase: new EliminarCuenta(analistaRepository),
  consultarVulnerabilidadPorCveUseCase: new ConsultarVulnerabilidadPorCVE(vulnerabilidadRepository),
  filtrarPorRangoCvssUseCase: new FiltrarPorRangoCvss(vulnerabilidadRepository),
  filtrarPorSeveridadUseCase: new FiltrarPorSeveridad(vulnerabilidadRepository),
  // RF-94: decorado, auditado y notificado. Invocado directamente por
  // SincronizarConApiNvd y, desde Sprint 14, indirectamente por
  // ImportarDatasetDesdeArchivo (RF-17) — sigue sin tener una ruta HTTP
  // propia que reciba un `resultado` ya parseado, lo cual está bien: ese
  // formato es un detalle interno entre LectorExcelDataset y este decorador.
  importarDatasetUseCase: importarDatasetConAuditoria,
  // RF-17: primera ruta HTTP para importar el dataset manualmente.
  importarDatasetDesdeArchivoUseCase: new ImportarDatasetDesdeArchivo(lectorExcelDataset, importarDatasetConAuditoria),
  // Mejora "mapeo flexible de columnas": detecta los headers reales del
  // archivo antes de importar, para el selector de mapeo del frontend.
  detectarColumnasDatasetUseCase: new DetectarColumnasDataset(lectorExcelDataset),
  sincronizarConApiNvdUseCase,
  // Sprint 17: importar pegando un link (NVD, Google Sheets, Dropbox) en vez
  // de subir un archivo. Comparte importarDatasetConAuditoria y
  // sincronizarConApiNvdUseCase — no duplica auditoría/notificación/lógica
  // de sincronización, solo agrega la detección de link + descarga segura.
  importarDatasetDesdeUrlUseCase: new ImportarDatasetDesdeUrl(
    descargadorDeArchivos,
    lectorExcelDataset,
    importarDatasetConAuditoria,
    sincronizarConApiNvdUseCase
  ),
  // RF-24: primera ruta HTTP para exportar el dataset validado (GET /dataset/exportar).
  exportarDatasetValidadoUseCase: new ExportarDatasetValidado(vulnerabilidadRepository),
  calcularResumenEstadisticoUseCase: new CalcularResumenEstadistico(vulnerabilidadRepository),
  generarDistribucionFrecuenciasUseCase: new GenerarDistribucionFrecuencias(vulnerabilidadRepository),
  generarGraficoUseCase: new GenerarGrafico(vulnerabilidadRepository, graficosOutputPort),
  compararPorTipoAccesoUseCase: new CompararPorTipoAcceso(vulnerabilidadRepository),
  compararPorTipoDeVulnerabilidadUseCase: new CompararPorTipoDeVulnerabilidad(vulnerabilidadRepository),
  compararPorSoftwareUseCase: new CompararPorSoftware(vulnerabilidadRepository),
  clasificarRiesgoUseCase: new ClasificarRiesgo(vulnerabilidadRepository),
  generarRankingUrgenciaUseCase: new GenerarRankingUrgencia(vulnerabilidadRepository, servicioDeNotificaciones),
  // RF-94: cambios de estado de remediación quedan auditados (quién y cuándo).
  marcarEnProcesoDeRemediacionUseCase: new MarcarEnProcesoDeRemediacionConAuditoria(
    new MarcarEnProcesoDeRemediacion(vulnerabilidadRepository),
    auditoriaRepository
  ),
  marcarComoRemediadaUseCase: new MarcarComoRemediadaConAuditoria(
    new MarcarComoRemediada(vulnerabilidadRepository),
    auditoriaRepository
  ),
  // RF-95: fecha, autor y tipo de cada informe generado quedan auditados.
  // RF-101: y de paso se notifica al analista que lo pidió que ya está listo.
  generarInformeUseCase: generarInformeConAuditoria,
  generarResumenEjecutivoUseCase: new GenerarResumenEjecutivoConAuditoria(
    new GenerarResumenEjecutivo(vulnerabilidadRepository, geradorDeInformes, auditoriaRepository),
    auditoriaRepository,
    servicioDeNotificaciones
  ),
  // RF-83: adaptador real (node-cron) conectado — antes el caso de uso
  // existía pero no había forma de invocarlo.
  programarInformePeriodicoUseCase: new ProgramarInformePeriodico(programadorDeTareas, generarInformeConAuditoria),
  buscarConFiltrosUseCase: new BuscarConFiltros(vulnerabilidadRepository),
  guardarFiltroFavoritoUseCase: new GuardarFiltroFavorito(filtroFavoritoRepository),
  listarFiltrosFavoritosUseCase: new ListarFiltrosFavoritos(filtroFavoritoRepository),
  exportarBusquedaFiltradaUseCase: new ExportarBusquedaFiltrada(vulnerabilidadRepository),
  consultarAuditoriaUseCase: new ConsultarAuditoria(auditoriaRepository),
  obtenerNotificacionesUseCase: new ObtenerNotificaciones(notificacionRepository),
  marcarNotificacionLeidaUseCase: new MarcarNotificacionLeida(notificacionRepository),
  // Mejora 4 (Análisis de Datos General) — Fase 2: módulo nuevo y separado,
  // sin ninguna dependencia de los repositorios/casos de uso de
  // vulnerabilidades de arriba.
  analizarDatasetGenericoUseCase: new AnalizarDatasetGenerico(new LectorDatasetGenerico(), sesionAnalisisStore),
  // Fase 3: reciben sesionId en vez de un archivo — leen del mismo
  // sesionAnalisisStore que acaba de poblar analizarDatasetGenericoUseCase.
  calcularEstadisticasDescriptivasGenericoUseCase: new CalcularEstadisticasDescriptivasGenerico(sesionAnalisisStore),
  analizarColumnaUnivariadoGenericoUseCase: new AnalizarColumnaUnivariadoGenerico(sesionAnalisisStore),
  // Fase 4: bivariado/multivariado (correlación) y detección de outliers —
  // mismo sesionAnalisisStore, mismo criterio IDOR.
  calcularMatrizCorrelacionGenericoUseCase: new CalcularMatrizCorrelacionGenerico(sesionAnalisisStore),
  detectarOutliersGenericoUseCase: new DetectarOutliersGenerico(sesionAnalisisStore),
  // Fase 5: mismo geradorDeInformes (GeneradorInformePDF) ya compartido con
  // generarInformeUseCase/generarResumenEjecutivoUseCase — un "documento de
  // datos" distinto (DatosInformeDataset), mismo generador PDF/Word.
  generarInformeDatasetUseCase: new GenerarInformeDataset(sesionAnalisisStore, geradorDeInformes)
};
