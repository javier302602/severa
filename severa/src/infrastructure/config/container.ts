import { Pool } from 'pg';
import { config } from './env';
import { PostgresAnalistaRepository } from '../adapters/out/persistencia/repositorios/PostgresAnalistaRepository';
import { PostgresVulnerabilidadRepository } from '../adapters/out/persistencia/repositorios/PostgresVulnerabilidadRepository';
import { PostgresFiltroFavoritoRepository } from '../adapters/out/persistencia/repositorios/PostgresFiltroFavoritoRepository';
import { PostgresAuditoriaRepository } from '../adapters/out/persistencia/repositorios/PostgresAuditoriaRepository';
import { PostgresNotificacionRepository } from '../adapters/out/persistencia/repositorios/PostgresNotificacionRepository';
import { PostgresTokenRecuperacionRepository } from '../adapters/out/persistencia/repositorios/PostgresTokenRecuperacionRepository';
import { PostgresHistorialAnalisisRepository } from '../adapters/out/persistencia/repositorios/PostgresHistorialAnalisisRepository';
import { ConsolaEnviadorDeCorreo } from '../adapters/out/notificaciones/ConsolaEnviadorDeCorreo';
import { BcryptHasher } from '../adapters/out/seguridad/BcryptHasher';
import { RegistrarAnalista } from '../../application/usecases/module_gestion_usuarios/RegistrarAnalista';
import { IniciarSesion } from '../../application/usecases/module_gestion_usuarios/IniciarSesion';
import { RecuperarContrasena } from '../../application/usecases/module_gestion_usuarios/RecuperarContrasena';
import { RestablecerContrasena } from '../../application/usecases/module_gestion_usuarios/RestablecerContrasena';
import { EditarPerfil } from '../../application/usecases/module_perfil_analista/EditarPerfil';
import { VerPerfil } from '../../application/usecases/module_perfil_analista/VerPerfil';
import { ObtenerHistorialAnalisis } from '../../application/usecases/module_perfil_analista/ObtenerHistorialAnalisis';
import { RegistrarAnalisisRealizado } from '../../application/usecases/module_perfil_analista/RegistrarAnalisisRealizado';
import { EliminarCuenta } from '../../application/usecases/module_gestion_usuarios/EliminarCuenta';
import { AsignarRol } from '../../application/usecases/module_gestion_usuarios/AsignarRol';
import { ConsultarVulnerabilidadPorCVE } from '../../application/usecases/module_priorizacion_clasificacion/ConsultarVulnerabilidadPorCVE';
import { FiltrarPorRangoDeVariable } from '../../application/usecases/module_priorizacion_clasificacion/FiltrarPorRangoDeVariable';
import { FiltrarPorCategoriaClasificacion } from '../../application/usecases/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacion';
import { ImportarDataset } from '../../application/usecases/module_carga_gestion_datasets/ImportarDataset';
import { SincronizarConApiNvd } from '../../application/usecases/module_carga_gestion_datasets/SincronizarConApiNvd';
import { ExportarDatasetValidado } from '../../application/usecases/module_carga_gestion_datasets/ExportarDatasetValidado';
import { CalcularResumenEstadistico } from '../../application/usecases/module_medidas_tendencia_dispersion/CalcularResumenEstadistico';
import { GenerarDistribucionFrecuencias } from '../../application/usecases/module_distribucion_frecuencias/GenerarDistribucionFrecuencias';
import { LectorExcelDataset } from '../adapters/out/dataset/parsers/LectorExcelDataset';
import { ImportarDatasetDesdeArchivo } from '../../application/usecases/module_carga_gestion_datasets/ImportarDatasetDesdeArchivo';
import { DetectarColumnasDataset } from '../../application/usecases/module_deteccion_variables/DetectarColumnasDataset';
import { ImportarDatasetDesdeUrl } from '../../application/usecases/module_carga_gestion_datasets/ImportarDatasetDesdeUrl';
import { DescargadorDeArchivosHttp } from '../adapters/out/dataset/DescargadorDeArchivosHttp';
import { NvdApiClientHttp } from '../adapters/out/fuentes-externas/nvd/NvdApiClientHttp';
import { GenerarGrafico } from '../../application/usecases/module_visualizacion_grafica/GenerarGrafico';
import { SvgGraficosAdapter } from '../adapters/out/graphics/SvgGraficosAdapter';
import { CompararPorTipoAcceso } from '../../application/usecases/module_comparacion_categorias/CompararPorTipoAcceso';
import { CompararPorTipoDeVulnerabilidad } from '../../application/usecases/module_comparacion_categorias/CompararPorTipoDeVulnerabilidad';
import { CompararPorSoftware } from '../../application/usecases/module_comparacion_categorias/CompararPorSoftware';
import { ListarSoftwareDisponible } from '../../application/usecases/module_comparacion_categorias/ListarSoftwareDisponible';
import { ClasificarRiesgo } from '../../application/usecases/module_priorizacion_clasificacion/ClasificarRiesgo';
import { GenerarRankingUrgencia } from '../../application/usecases/module_priorizacion_clasificacion/GenerarRankingUrgencia';
import { MarcarEnProcesoDeRemediacion } from '../../application/usecases/module_priorizacion_clasificacion/MarcarEnProcesoDeRemediacion';
import { MarcarComoRemediada } from '../../application/usecases/module_priorizacion_clasificacion/MarcarComoRemediada';
import { ConsolaServicioDeNotificaciones } from '../adapters/out/notificaciones/ConsolaServicioDeNotificaciones';
import { GenerarInforme } from '../../application/usecases/module_reportes_exportacion/GenerarInforme';
import { GenerarResumenEjecutivo } from '../../application/usecases/module_reportes_exportacion/GenerarResumenEjecutivo';
import { ProgramarInformePeriodico } from '../../application/usecases/module_reportes_exportacion/ProgramarInformePeriodico';
import { NodeCronProgramadorDeTareas } from '../adapters/out/scheduler/NodeCronProgramadorDeTareas';
import { GeneradorInformePDF } from '../adapters/out/reportes/GeneradorInformePDF';
import { BuscarConFiltros } from '../../application/usecases/module_busqueda_filtros_avanzados/BuscarConFiltros';
import { GuardarFiltroFavorito } from '../../application/usecases/module_busqueda_filtros_avanzados/GuardarFiltroFavorito';
import { ListarFiltrosFavoritos } from '../../application/usecases/module_busqueda_filtros_avanzados/ListarFiltrosFavoritos';
import { ExportarBusquedaFiltrada } from '../../application/usecases/module_busqueda_filtros_avanzados/ExportarBusquedaFiltrada';
import { ConsultarAuditoria } from '../../application/usecases/module_seguridad_auditoria/ConsultarAuditoria';
import { ObtenerNotificaciones } from '../../application/usecases/module_notificaciones_alertas/ObtenerNotificaciones';
import { MarcarNotificacionLeida } from '../../application/usecases/module_notificaciones_alertas/MarcarNotificacionLeida';
import { MarcarTodasLasNotificacionesLeidas } from '../../application/usecases/module_notificaciones_alertas/MarcarTodasLasNotificacionesLeidas';
import { EliminarNotificaciones } from '../../application/usecases/module_notificaciones_alertas/EliminarNotificaciones';
import { IniciarSesionConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/IniciarSesionConAuditoria';
import { ImportarDatasetConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/ImportarDatasetConAuditoria';
import { MarcarEnProcesoDeRemediacionConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/MarcarEnProcesoDeRemediacionConAuditoria';
import { AsignarRolConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/AsignarRolConAuditoria';
import { RecuperarContrasenaConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/RecuperarContrasenaConAuditoria';
import { RestablecerContrasenaConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/RestablecerContrasenaConAuditoria';
import { EliminarCuentaConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/EliminarCuentaConAuditoria';
import { EditarPerfilConAuditoriaYNotificacion } from '../../application/usecases/module_seguridad_auditoria/decoradores/EditarPerfilConAuditoriaYNotificacion';
import { MarcarComoRemediadaConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/MarcarComoRemediadaConAuditoria';
import { GenerarInformeConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/GenerarInformeConAuditoria';
import { GenerarResumenEjecutivoConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/GenerarResumenEjecutivoConAuditoria';
import { LectorDatasetGenerico } from '../adapters/out/dataset/parsers/LectorDatasetGenerico';
import { SesionAnalisisStoreEnMemoria } from '../adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { AnalizarDatasetGenerico } from '../../application/usecases/module_carga_gestion_datasets/AnalizarDatasetGenerico';
import { CalcularEstadisticasDescriptivasGenerico } from '../../application/usecases/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenerico';
import { AnalizarColumnaUnivariadoGenerico } from '../../application/usecases/module_medidas_tendencia_dispersion/AnalizarColumnaUnivariadoGenerico';
import { CalcularMatrizCorrelacionGenerico } from '../../application/usecases/module_medidas_tendencia_dispersion/CalcularMatrizCorrelacionGenerico';
import { DetectarOutliersGenerico } from '../../application/usecases/module_limpieza_calidad_datos/DetectarOutliersGenerico';
import { GenerarInformeDataset } from '../../application/usecases/module_reportes_exportacion/GenerarInformeDataset';
import { ReiniciarDataset } from '../../application/usecases/module_carga_gestion_datasets/ReiniciarDataset';
import { ReiniciarDatasetConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/ReiniciarDatasetConAuditoria';
import { ConvertirUrlAExcel } from '../../application/usecases/module_carga_gestion_datasets/ConvertirUrlAExcel';

const pool = new Pool({ connectionString: config.databaseUrl });
const analistaRepository = new PostgresAnalistaRepository(pool);
const vulnerabilidadRepository = new PostgresVulnerabilidadRepository(pool);
const filtroFavoritoRepository = new PostgresFiltroFavoritoRepository(pool);
const auditoriaRepository = new PostgresAuditoriaRepository(pool);
const notificacionRepository = new PostgresNotificacionRepository(pool);
const tokenRecuperacionRepository = new PostgresTokenRecuperacionRepository(pool);
const historialAnalisisRepository = new PostgresHistorialAnalisisRepository(pool);
const hasher = new BcryptHasher();
// RF-03: adaptador simulado (consola), mismo criterio que
// ConsolaServicioDeNotificaciones — no hay infraestructura SMTP real.
const enviadorDeCorreo = new ConsolaEnviadorDeCorreo();
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
  importarDatasetConAuditoria,
  servicioDeNotificaciones
);
const descargadorDeArchivos = new DescargadorDeArchivosHttp();
// Compartido entre `generarInformeUseCase` y `programarInformePeriodicoUseCase`
// para que un informe generado automáticamente por el cron quede auditado
// (RF-95) y notificado (RF-101) igual que uno pedido a mano.
const generarInformeConAuditoria = new GenerarInformeConAuditoria(
  new GenerarInforme(vulnerabilidadRepository, geradorDeInformes, auditoriaRepository, analistaRepository),
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
  // RF-03/RNF-33: decorados con auditoría — queda registrado quién solicitó
  // una recuperación (solo si el correo existe) y quién efectivamente
  // restableció su contraseña.
  recuperarContrasenaUseCase: new RecuperarContrasenaConAuditoria(
    new RecuperarContrasena(analistaRepository, tokenRecuperacionRepository, enviadorDeCorreo),
    auditoriaRepository
  ),
  restablecerContrasenaUseCase: new RestablecerContrasenaConAuditoria(
    new RestablecerContrasena(analistaRepository, tokenRecuperacionRepository, hasher),
    auditoriaRepository
  ),
  // RF-10/RNF-41 + RF-16: decorado con auditoría y notificación — antes
  // quedaba "pelado" (sin auditar) y EditarPerfil.ts no disparaba ninguna
  // notificación de cambio de perfil.
  editarPerfilUseCase: new EditarPerfilConAuditoriaYNotificacion(
    new EditarPerfil(analistaRepository),
    analistaRepository,
    auditoriaRepository,
    servicioDeNotificaciones
  ),
  verPerfilUseCase: new VerPerfil(analistaRepository),
  // RF-15/RNF-41: decorado con auditoría — una eliminación de cuenta exitosa
  // (previa confirmación con contraseña, ver EliminarCuenta.ts) queda
  // registrada. No se audita un intento con contraseña incorrecta (ver
  // EliminarCuentaConAuditoria).
  eliminarCuentaUseCase: new EliminarCuentaConAuditoria(
    new EliminarCuenta(analistaRepository, hasher),
    analistaRepository,
    auditoriaRepository
  ),
  // RF-11: solo infraestructura de consulta/escritura del historial de
  // análisis. registrarAnalisisRealizadoUseCase queda dado de alta para que
  // los módulos que generan análisis reales lo invoquen más adelante (M-05 a
  // M-09) — deliberadamente sin conectar a ningún productor todavía.
  obtenerHistorialAnalisisUseCase: new ObtenerHistorialAnalisis(historialAnalisisRepository),
  registrarAnalisisRealizadoUseCase: new RegistrarAnalisisRealizado(historialAnalisisRepository),
  // RF-04/RNF-33: decorado con auditoría — queda registrado quién asignó qué
  // rol a quién y cuál era el rol anterior.
  asignarRolUseCase: new AsignarRolConAuditoria(
    new AsignarRol(analistaRepository),
    analistaRepository,
    auditoriaRepository
  ),
  consultarVulnerabilidadPorCveUseCase: new ConsultarVulnerabilidadPorCVE(vulnerabilidadRepository),
  filtrarPorRangoDeVariableUseCase: new FiltrarPorRangoDeVariable(vulnerabilidadRepository),
  filtrarPorCategoriaClasificacionUseCase: new FiltrarPorCategoriaClasificacion(vulnerabilidadRepository),
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
    sincronizarConApiNvdUseCase,
    vulnerabilidadRepository
  ),
  // RF-24: primera ruta HTTP para exportar el dataset validado (GET /dataset/exportar).
  exportarDatasetValidadoUseCase: new ExportarDatasetValidado(vulnerabilidadRepository),
  calcularResumenEstadisticoUseCase: new CalcularResumenEstadistico(vulnerabilidadRepository),
  generarDistribucionFrecuenciasUseCase: new GenerarDistribucionFrecuencias(vulnerabilidadRepository),
  generarGraficoUseCase: new GenerarGrafico(vulnerabilidadRepository, graficosOutputPort),
  compararPorTipoAccesoUseCase: new CompararPorTipoAcceso(vulnerabilidadRepository),
  compararPorTipoDeVulnerabilidadUseCase: new CompararPorTipoDeVulnerabilidad(vulnerabilidadRepository),
  compararPorSoftwareUseCase: new CompararPorSoftware(vulnerabilidadRepository),
  listarSoftwareDisponibleUseCase: new ListarSoftwareDisponible(vulnerabilidadRepository),
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
    new GenerarResumenEjecutivo(vulnerabilidadRepository, geradorDeInformes, auditoriaRepository, analistaRepository),
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
  marcarTodasLasNotificacionesLeidasUseCase: new MarcarTodasLasNotificacionesLeidas(notificacionRepository),
  eliminarNotificacionesUseCase: new EliminarNotificaciones(notificacionRepository),
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
  generarInformeDatasetUseCase: new GenerarInformeDataset(sesionAnalisisStore, geradorDeInformes, analistaRepository),
  // "Restablecer datos": acción administrativa (requiereRol('administrador')
  // en DatasetController.ts) — auditada igual que cualquier otro cambio de
  // dataset (RF-94).
  reiniciarDatasetUseCase: new ReiniciarDatasetConAuditoria(new ReiniciarDataset(vulnerabilidadRepository), auditoriaRepository),
  // "Convertir link a Excel": reutiliza exactamente los mismos adaptadores de
  // seguridad ya conectados arriba (descargadorDeArchivos, nvdApiClient) —
  // no crea ninguna instancia nueva ni relaja ningún control de SSRF/allowlist.
  convertirUrlAExcelUseCase: new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient)
};
