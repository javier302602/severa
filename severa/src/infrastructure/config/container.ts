import { Pool } from 'pg';
import { config } from './env';
import { PostgresAnalistaRepository } from '../adapters/out/persistencia/repositorios/PostgresAnalistaRepository';
import { PostgresVulnerabilidadRepository } from '../adapters/out/persistencia/repositorios/PostgresVulnerabilidadRepository';
import { PostgresFiltroFavoritoRepository } from '../adapters/out/persistencia/repositorios/PostgresFiltroFavoritoRepository';
import { PostgresAuditoriaRepository } from '../adapters/out/persistencia/repositorios/PostgresAuditoriaRepository';
import { PostgresNotificacionRepository } from '../adapters/out/persistencia/repositorios/PostgresNotificacionRepository';
import { PostgresTokenRecuperacionRepository } from '../adapters/out/persistencia/repositorios/PostgresTokenRecuperacionRepository';
import { PostgresHistorialAnalisisRepository } from '../adapters/out/persistencia/repositorios/PostgresHistorialAnalisisRepository';
import { PostgresDatasetGenericoRepository } from '../adapters/out/persistencia/repositorios/PostgresDatasetGenericoRepository';
import { ConsolaEnviadorDeCorreo } from '../adapters/out/notificaciones/ConsolaEnviadorDeCorreo';
import { BcryptHasher } from '../adapters/out/seguridad/BcryptHasher';
import { RegistrarAnalista } from '../../application/usecases/module_gestion_usuarios/RegistrarAnalista';
import { IniciarSesion } from '../../application/usecases/module_gestion_usuarios/IniciarSesion';
import { RecuperarContrasena } from '../../application/usecases/module_gestion_usuarios/RecuperarContrasena';
import { RestablecerContrasena } from '../../application/usecases/module_gestion_usuarios/RestablecerContrasena';
import { EditarPerfil } from '../../application/usecases/module_perfil_analista/EditarPerfil';
import { VerPerfil } from '../../application/usecases/module_perfil_analista/VerPerfil';
import { ObtenerHistorialAnalisis } from '../../application/usecases/module_perfil_analista/ObtenerHistorialAnalisis';
import { RegistrarEnHistorialDeAnalisis } from '../../application/usecases/module_perfil_analista/RegistrarEnHistorialDeAnalisis';
import { ExportarHistorialAnalisis } from '../../application/usecases/module_perfil_analista/ExportarHistorialAnalisis';
import { conHistorialDeSesion, conHistorialDelCatalogo } from '../../application/usecases/module_perfil_analista/decoradores/ConHistorialDeAnalisis';
import { ExportadorDeTablaExcelJs } from '../adapters/out/exportacion/ExportadorDeTablaExcelJs';
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
import { ExportarDistribucionFrecuencias } from '../../application/usecases/module_distribucion_frecuencias/ExportarDistribucionFrecuencias';
import { LectorExcelDataset } from '../adapters/out/dataset/parsers/LectorExcelDataset';
import { ImportarDatasetDesdeArchivo } from '../../application/usecases/module_carga_gestion_datasets/ImportarDatasetDesdeArchivo';
import { DetectarColumnasDataset } from '../../application/usecases/module_deteccion_variables/DetectarColumnasDataset';
import { ImportarDatasetDesdeUrl } from '../../application/usecases/module_carga_gestion_datasets/ImportarDatasetDesdeUrl';
import { DescargadorDeArchivosHttp } from '../adapters/out/dataset/DescargadorDeArchivosHttp';
import { NvdApiClientHttp } from '../adapters/out/fuentes-externas/nvd/NvdApiClientHttp';
import { GenerarGrafico } from '../../application/usecases/module_visualizacion_grafica/GenerarGrafico';
import { GenerarHistogramaDeTiempoGenerico } from '../../application/usecases/module_visualizacion_grafica/GenerarHistogramaDeTiempoGenerico';
import { SvgGraficosAdapter } from '../adapters/out/graphics/SvgGraficosAdapter';
import { CompararPorTipoAcceso } from '../../application/usecases/module_comparacion_categorias/CompararPorTipoAcceso';
import { CompararPorTipoDeVulnerabilidad } from '../../application/usecases/module_comparacion_categorias/CompararPorTipoDeVulnerabilidad';
import { CompararPorSoftware } from '../../application/usecases/module_comparacion_categorias/CompararPorSoftware';
import { ListarSoftwareDisponible } from '../../application/usecases/module_comparacion_categorias/ListarSoftwareDisponible';
import { CompararPorCategoria } from '../../application/usecases/module_comparacion_categorias/CompararPorCategoria';
import { CompararPorCategoriasCruzadas } from '../../application/usecases/module_comparacion_categorias/CompararPorCategoriasCruzadas';
import { ClasificarRiesgo } from '../../application/usecases/module_priorizacion_clasificacion/ClasificarRiesgo';
import { GenerarRankingUrgencia } from '../../application/usecases/module_priorizacion_clasificacion/GenerarRankingUrgencia';
import { MarcarEnProcesoDeRemediacion } from '../../application/usecases/module_priorizacion_clasificacion/MarcarEnProcesoDeRemediacion';
import { MarcarComoRemediada } from '../../application/usecases/module_priorizacion_clasificacion/MarcarComoRemediada';
import { ConsolaServicioDeNotificaciones } from '../adapters/out/notificaciones/ConsolaServicioDeNotificaciones';
import { PostgresRegistroDeAlertasEmitidas } from '../adapters/out/persistencia/repositorios/PostgresRegistroDeAlertasEmitidas';
import { EmisorDeAlertasDePlazo } from '../../application/usecases/module_notificaciones_alertas/EmisorDeAlertasDePlazo';
import { GenerarInforme } from '../../application/usecases/module_reportes_exportacion/GenerarInforme';
import { GenerarResumenEjecutivo } from '../../application/usecases/module_reportes_exportacion/GenerarResumenEjecutivo';
import { ProgramarInformePeriodico } from '../../application/usecases/module_reportes_exportacion/ProgramarInformePeriodico';
import { NodeCronProgramadorDeTareas } from '../adapters/out/scheduler/NodeCronProgramadorDeTareas';
import { GeneradorInformePDF } from '../adapters/out/reportes/GeneradorInformePDF';
import { BuscarConFiltros } from '../../application/usecases/module_busqueda_filtros_avanzados/BuscarConFiltros';
import { GuardarFiltroFavorito } from '../../application/usecases/module_busqueda_filtros_avanzados/GuardarFiltroFavorito';
import { EliminarFiltroFavorito } from '../../application/usecases/module_busqueda_filtros_avanzados/EliminarFiltroFavorito';
import { ListarFiltrosFavoritos } from '../../application/usecases/module_busqueda_filtros_avanzados/ListarFiltrosFavoritos';
import { ExportarBusquedaFiltrada } from '../../application/usecases/module_busqueda_filtros_avanzados/ExportarBusquedaFiltrada';
import { ConsultarAuditoria } from '../../application/usecases/module_seguridad_auditoria/ConsultarAuditoria';
import { ObtenerNotificaciones } from '../../application/usecases/module_notificaciones_alertas/ObtenerNotificaciones';
import { MarcarNotificacionLeida } from '../../application/usecases/module_notificaciones_alertas/MarcarNotificacionLeida';
import { MarcarTodasLasNotificacionesLeidas } from '../../application/usecases/module_notificaciones_alertas/MarcarTodasLasNotificacionesLeidas';
import { EliminarNotificaciones } from '../../application/usecases/module_notificaciones_alertas/EliminarNotificaciones';
import { EliminarNotificacionesLeidas } from '../../application/usecases/module_notificaciones_alertas/EliminarNotificacionesLeidas';
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
import { GenerarInformeDatasetConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/GenerarInformeDatasetConAuditoria';
import { LectorDatasetGenerico } from '../adapters/out/dataset/parsers/LectorDatasetGenerico';
import { SesionAnalisisStoreEnMemoria } from '../adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { AnalizarDatasetGenerico } from '../../application/usecases/module_carga_gestion_datasets/AnalizarDatasetGenerico';
import { CalcularEstadisticasDescriptivasGenerico } from '../../application/usecases/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenerico';
import { AnalizarColumnaUnivariadoGenerico } from '../../application/usecases/module_medidas_tendencia_dispersion/AnalizarColumnaUnivariadoGenerico';
import { CalcularMatrizCorrelacionGenerico } from '../../application/usecases/module_medidas_tendencia_dispersion/CalcularMatrizCorrelacionGenerico';
import { DetectarOutliersGenerico } from '../../application/usecases/module_limpieza_calidad_datos/DetectarOutliersGenerico';
import { AnalizarCalidadDatasetGenerico } from '../../application/usecases/module_limpieza_calidad_datos/AnalizarCalidadDatasetGenerico';
import { GenerarInformeDataset } from '../../application/usecases/module_reportes_exportacion/GenerarInformeDataset';
import { ReiniciarDataset } from '../../application/usecases/module_carga_gestion_datasets/ReiniciarDataset';
import { ReiniciarDatasetConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/ReiniciarDatasetConAuditoria';
import { ConvertirUrlAExcel } from '../../application/usecases/module_carga_gestion_datasets/ConvertirUrlAExcel';
import { ExportarDatasetGenerico } from '../../application/usecases/module_carga_gestion_datasets/ExportarDatasetGenerico';
import { AnalizarDatasetGenericoConAuditoria } from '../../application/usecases/module_seguridad_auditoria/decoradores/AnalizarDatasetGenericoConAuditoria';
import { ConfigurarCriterioDeClasificacion } from '../../application/usecases/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacion';
import { VerificarIntegridadDataset } from '../../application/usecases/module_carga_gestion_datasets/VerificarIntegridadDataset';
import { EvaluarSerieDeTiempoGenerico } from '../../application/usecases/module_deteccion_variables/EvaluarSerieDeTiempoGenerico';
import { SugerirVariableObjetivo } from '../../application/usecases/module_deteccion_variables/SugerirVariableObjetivo';
import { DefinirVariableObjetivo } from '../../application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { CorregirTipoDeVariable } from '../../application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { ProponerTratamientoDeFaltantes } from '../../application/usecases/module_limpieza_calidad_datos/ProponerTratamientoDeFaltantes';
import { AplicarLimpiezaDeDataset } from '../../application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { ConsultarBitacoraDeDataset } from '../../application/usecases/module_limpieza_calidad_datos/ConsultarBitacoraDeDataset';
import { ListarDatasetsGenericos } from '../../application/usecases/module_carga_gestion_datasets/ListarDatasetsGenericos';
import { ListarVersionesDeDataset } from '../../application/usecases/module_carga_gestion_datasets/ListarVersionesDeDataset';
import { AbrirDatasetGenerico } from '../../application/usecases/module_carga_gestion_datasets/AbrirDatasetGenerico';
import {
  AplicarLimpiezaDeDatasetConAuditoria,
  AplicarPlantillaDeAnalisisConAuditoria,
  ConfigurarCriterioDeClasificacionConAuditoria,
  CorregirTipoDeVariableConAuditoria,
  DefinirVariableObjetivoConAuditoria,
  ExportarDatasetGenericoConAuditoria
} from '../../application/usecases/module_seguridad_auditoria/decoradores/OperacionesDeDatasetGenericoConAuditoria';
import { PostgresPlantillaDeAnalisisRepository } from '../adapters/out/persistencia/repositorios/PostgresPlantillaDeAnalisisRepository';
import { GuardarPlantillaDeAnalisis } from '../../application/usecases/module_perfil_analista/GuardarPlantillaDeAnalisis';
import { ListarPlantillasDeAnalisis } from '../../application/usecases/module_perfil_analista/ListarPlantillasDeAnalisis';
import { EliminarPlantillaDeAnalisis } from '../../application/usecases/module_perfil_analista/EliminarPlantillaDeAnalisis';
import { AplicarPlantillaDeAnalisis } from '../../application/usecases/module_perfil_analista/AplicarPlantillaDeAnalisis';
import { ExportadorExcelAgrupado } from '../adapters/out/dataset/parsers/ExportadorExcelAgrupado';
import { PostgresEscalaDeClasificacionRepository } from '../adapters/out/persistencia/repositorios/PostgresEscalaDeClasificacionRepository';
import {
  GuardarEscalaDeClasificacion,
  ObtenerEscalaDeClasificacion,
  RestablecerEscalaDeClasificacion
} from '../../application/usecases/module_priorizacion_clasificacion/EscalaDeClasificacion';
import {
  GuardarEscalaDeClasificacionConAuditoria,
  RestablecerEscalaDeClasificacionConAuditoria
} from '../../application/usecases/module_seguridad_auditoria/decoradores/EscalaDeClasificacionConAuditoria';
import { ConfigurarUmbralCritico } from '../../application/usecases/module_notificaciones_alertas/ConfigurarUmbralCritico';
import { NotificarPlazosProximosAVencer } from '../../application/usecases/module_notificaciones_alertas/NotificarPlazosProximosAVencer';

const pool = new Pool({ connectionString: config.databaseUrl });

// Cierra las conexiones a la base. Lo usan los tests de integración que
// levantan la aplicación real, para terminar sin esperar a que el pool las
// suelte por inactividad.
export function cerrarConexiones(): Promise<void> {
  return pool.end();
}
const analistaRepository = new PostgresAnalistaRepository(pool);
const vulnerabilidadRepository = new PostgresVulnerabilidadRepository(pool);
const filtroFavoritoRepository = new PostgresFiltroFavoritoRepository(pool);
const auditoriaRepository = new PostgresAuditoriaRepository(pool);
const notificacionRepository = new PostgresNotificacionRepository(pool);
const tokenRecuperacionRepository = new PostgresTokenRecuperacionRepository(pool);
const historialAnalisisRepository = new PostgresHistorialAnalisisRepository(pool);
const datasetGenericoRepository = new PostgresDatasetGenericoRepository(pool);
const plantillaDeAnalisisRepository = new PostgresPlantillaDeAnalisisRepository(pool);
const escalaDeClasificacionRepository = new PostgresEscalaDeClasificacionRepository(pool);
// RF-24 / RF-90: el catálogo agrupado por nivel de riesgo en .xlsx.
const exportadorDeCatalogoAgrupado = new ExportadorExcelAgrupado();
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
// RF-76/RF-100: un solo emisor para las dos alertas de plazo, con memoria
// de lo ya emitido (migración 017) para no repetirlas en cada evaluación.
const emisorDeAlertasDePlazo = new EmisorDeAlertasDePlazo(new PostgresRegistroDeAlertasEmitidas(pool), servicioDeNotificaciones);
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
  servicioDeNotificaciones,
  analistaRepository
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
// RF-11 (M-02): único productor del historial de análisis del analista. Los
// casos de uso de análisis se envuelven más abajo con conHistorialDeSesion /
// conHistorialDelCatalogo, así que ninguno de ellos (ni sus controladores)
// sabe que el historial existe.
const historialDeAnalisis = new RegistrarEnHistorialDeAnalisis(historialAnalisisRepository, sesionAnalisisStore, datasetGenericoRepository);
// Compartido entre `generarInformeUseCase` y `programarInformePeriodicoUseCase`
// para que un informe generado automáticamente por el cron quede auditado
// (RF-95) y notificado (RF-101) igual que uno pedido a mano.
const generarInformeConAuditoria = new GenerarInformeConAuditoria(
  new GenerarInforme(vulnerabilidadRepository, geradorDeInformes, auditoriaRepository, analistaRepository),
  auditoriaRepository,
  servicioDeNotificaciones,
  historialDeAnalisis
);

const generarDistribucionFrecuenciasUseCase = conHistorialDelCatalogo(
  new GenerarDistribucionFrecuencias(vulnerabilidadRepository),
  historialDeAnalisis,
  'DistribucionDeFrecuencias',
  ([, analistaId]) => analistaId
);

// M-14 Ronda 2 (RF-110/111) y RF-139: las tres operaciones que cambian cómo
// se interpreta un dataset genérico, con auditoría. Fuera del objeto porque
// las usan dos entradas: sus propias rutas y la aplicación de plantillas (RF-12).
const definirVariableObjetivoUseCase = new DefinirVariableObjetivoConAuditoria(
  new DefinirVariableObjetivo(sesionAnalisisStore, datasetGenericoRepository),
  auditoriaRepository
);
const corregirTipoDeVariableUseCase = new CorregirTipoDeVariableConAuditoria(
  new CorregirTipoDeVariable(sesionAnalisisStore, datasetGenericoRepository),
  auditoriaRepository
);
const configurarCriterioDeClasificacionUseCase = new ConfigurarCriterioDeClasificacionConAuditoria(
  new ConfigurarCriterioDeClasificacion(datasetGenericoRepository),
  auditoriaRepository
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
  // RF-11: historial de análisis del analista (lo escribe historialDeAnalisis,
  // ver arriba). RF-14: el mismo historial, exportado a .xlsx.
  obtenerHistorialAnalisisUseCase: new ObtenerHistorialAnalisis(historialAnalisisRepository),
  registrarEnHistorialDeAnalisisUseCase: historialDeAnalisis,
  exportarHistorialAnalisisUseCase: new ExportarHistorialAnalisis(
    historialAnalisisRepository,
    new ExportadorDeTablaExcelJs(),
    // Las fechas del archivo van con el mismo reloj que las de los informes.
    config.zonaHorariaInformes
  ),
  // RF-04/RNF-33: decorado con auditoría — queda registrado quién asignó qué
  // rol a quién y cuál era el rol anterior.
  asignarRolUseCase: new AsignarRolConAuditoria(
    new AsignarRol(analistaRepository),
    analistaRepository,
    auditoriaRepository
  ),
  consultarVulnerabilidadPorCveUseCase: new ConsultarVulnerabilidadPorCVE(vulnerabilidadRepository),
  filtrarPorRangoDeVariableUseCase: new FiltrarPorRangoDeVariable(vulnerabilidadRepository),
  filtrarPorCategoriaClasificacionUseCase: new FiltrarPorCategoriaClasificacion(vulnerabilidadRepository, escalaDeClasificacionRepository),
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
    vulnerabilidadRepository,
    analistaRepository
  ),
  // RF-24: primera ruta HTTP para exportar el dataset validado (GET /dataset/exportar).
  exportarDatasetValidadoUseCase: new ExportarDatasetValidado(vulnerabilidadRepository, escalaDeClasificacionRepository, exportadorDeCatalogoAgrupado),
  calcularResumenEstadisticoUseCase: conHistorialDelCatalogo(
    new CalcularResumenEstadistico(vulnerabilidadRepository),
    historialDeAnalisis,
    'ResumenEstadistico',
    ([analistaId]) => analistaId
  ),
  generarDistribucionFrecuenciasUseCase,
  // RF-38: exporta la tabla de frecuencias a .xlsx pidiéndosela al mismo caso
  // de uso que alimenta la pantalla.
  exportarDistribucionFrecuenciasUseCase: new ExportarDistribucionFrecuencias(generarDistribucionFrecuenciasUseCase),
  generarGraficoUseCase: conHistorialDelCatalogo(
    new GenerarGrafico(vulnerabilidadRepository, graficosOutputPort),
    historialDeAnalisis,
    'Graficos',
    ([, analistaId]) => analistaId
  ),
  // RF-58 (M-07): separado a propósito de generarGraficoUseCase (CVSS) —
  // reutiliza el mismo sesionAnalisisStore que las demás rutas de Fase 3/4
  // genéricas de M-05/M-06, no vulnerabilidadRepository. Ver auditoría SDS M-07.
  generarHistogramaDeTiempoGenericoUseCase: conHistorialDeSesion(
    new GenerarHistogramaDeTiempoGenerico(sesionAnalisisStore),
    historialDeAnalisis,
    'SerieDeTiempo'
  ),
  // RF-11: las cinco comparaciones se anotan como un mismo tipo de análisis.
  compararPorTipoAccesoUseCase: conHistorialDelCatalogo(
    new CompararPorTipoAcceso(vulnerabilidadRepository),
    historialDeAnalisis,
    'ComparacionPorCategorias',
    ([analistaId]) => analistaId
  ),
  compararPorTipoDeVulnerabilidadUseCase: conHistorialDelCatalogo(
    new CompararPorTipoDeVulnerabilidad(vulnerabilidadRepository),
    historialDeAnalisis,
    'ComparacionPorCategorias',
    ([, , analistaId]) => analistaId
  ),
  compararPorSoftwareUseCase: conHistorialDelCatalogo(
    new CompararPorSoftware(vulnerabilidadRepository),
    historialDeAnalisis,
    'ComparacionPorCategorias',
    ([, , analistaId]) => analistaId
  ),
  listarSoftwareDisponibleUseCase: new ListarSoftwareDisponible(vulnerabilidadRepository),
  // M-08 (retoma, RF-62/63/64/65/67): N categorías (cerradas o abiertas) y
  // cross-tab — CompararPorTipoAcceso/CompararPorTipoDeVulnerabilidad/
  // CompararPorSoftware (arriba) quedan intactos, sin relación con estos dos.
  compararPorCategoriaUseCase: conHistorialDelCatalogo(
    new CompararPorCategoria(vulnerabilidadRepository),
    historialDeAnalisis,
    'ComparacionPorCategorias',
    ([analistaId]) => analistaId
  ),
  compararPorCategoriasCruzadasUseCase: conHistorialDelCatalogo(
    new CompararPorCategoriasCruzadas(vulnerabilidadRepository),
    historialDeAnalisis,
    'ComparacionPorCategorias',
    ([analistaId]) => analistaId
  ),
  clasificarRiesgoUseCase: new ClasificarRiesgo(vulnerabilidadRepository),
  generarRankingUrgenciaUseCase: conHistorialDelCatalogo(
    new GenerarRankingUrgencia(vulnerabilidadRepository, emisorDeAlertasDePlazo),
    historialDeAnalisis,
    'RankingDeUrgencia',
    ([analistaId]) => analistaId
  ),
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
  generarResumenEjecutivoUseCase: conHistorialDelCatalogo(
    new GenerarResumenEjecutivoConAuditoria(
      new GenerarResumenEjecutivo(vulnerabilidadRepository, geradorDeInformes, auditoriaRepository, analistaRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    ),
    historialDeAnalisis,
    'ResumenEjecutivo',
    ([analistaId]) => analistaId,
    () => ({ cadaVez: true, detalle: 'Formato PDF' })
  ),
  // RF-83: adaptador real (node-cron) conectado — antes el caso de uso
  // existía pero no había forma de invocarlo.
  programarInformePeriodicoUseCase: new ProgramarInformePeriodico(programadorDeTareas, generarInformeConAuditoria),
  buscarConFiltrosUseCase: new BuscarConFiltros(vulnerabilidadRepository, escalaDeClasificacionRepository),
  // RF-28 / RF-69 (Modo B): escala de clasificación del catálogo, por
  // analista. Cambiarla se audita.
  obtenerEscalaDeClasificacionUseCase: new ObtenerEscalaDeClasificacion(escalaDeClasificacionRepository),
  guardarEscalaDeClasificacionUseCase: new GuardarEscalaDeClasificacionConAuditoria(
    new GuardarEscalaDeClasificacion(escalaDeClasificacionRepository),
    auditoriaRepository
  ),
  restablecerEscalaDeClasificacionUseCase: new RestablecerEscalaDeClasificacionConAuditoria(
    new RestablecerEscalaDeClasificacion(escalaDeClasificacionRepository),
    auditoriaRepository
  ),
  guardarFiltroFavoritoUseCase: new GuardarFiltroFavorito(filtroFavoritoRepository),
  listarFiltrosFavoritosUseCase: new ListarFiltrosFavoritos(filtroFavoritoRepository),
  eliminarFiltroFavoritoUseCase: new EliminarFiltroFavorito(filtroFavoritoRepository),
  exportarBusquedaFiltradaUseCase: new ExportarBusquedaFiltrada(vulnerabilidadRepository, escalaDeClasificacionRepository, exportadorDeCatalogoAgrupado),
  consultarAuditoriaUseCase: new ConsultarAuditoria(auditoriaRepository),
  obtenerNotificacionesUseCase: new ObtenerNotificaciones(notificacionRepository),
  marcarNotificacionLeidaUseCase: new MarcarNotificacionLeida(notificacionRepository),
  marcarTodasLasNotificacionesLeidasUseCase: new MarcarTodasLasNotificacionesLeidas(notificacionRepository),
  eliminarNotificacionesUseCase: new EliminarNotificaciones(notificacionRepository),
  eliminarNotificacionesLeidasUseCase: new EliminarNotificacionesLeidas(notificacionRepository),
  // Mejora 4 (Análisis de Datos General) — Fase 2: módulo nuevo y separado,
  // sin ninguna dependencia de los repositorios/casos de uso de
  // vulnerabilidades de arriba.
  // Generalización de M-03 (RF-17/18/21/23): además de la sesión efímera de
  // siempre, ahora persiste en datasets_genericos/registros_datasets_genericos
  // — decorado con auditoría (RNF-49), sin notificación (ver el decorador).
  // — decorado con auditoría (RNF-49) e historial (RF-11), sin notificación
  // (ver el decorador).
  analizarDatasetGenericoUseCase: new AnalizarDatasetGenericoConAuditoria(
    new AnalizarDatasetGenerico(new LectorDatasetGenerico(), sesionAnalisisStore, datasetGenericoRepository),
    auditoriaRepository,
    historialDeAnalisis
  ),
  // RF-24 generalizado: exporta el dataset genérico persistido tal cual, sin
  // agrupar por severidad (eso sigue siendo exclusivo de exportarDatasetValidadoUseCase).
  // RF-138: la exportación es una de las operaciones sobre datasets que el
  // requisito pide dejar en la auditoría central.
  exportarDatasetGenericoUseCase: new ExportarDatasetGenericoConAuditoria(
    new ExportarDatasetGenerico(datasetGenericoRepository),
    auditoriaRepository
  ),
  // M-14, Ronda 2 (RF-108/110/111). Las dos que escriben (variable objetivo
  // y corrección de tipo) van con auditoría; las dos de lectura, no.
  evaluarSerieDeTiempoGenericoUseCase: conHistorialDeSesion(new EvaluarSerieDeTiempoGenerico(sesionAnalisisStore), historialDeAnalisis, 'SerieDeTiempo'),
  sugerirVariableObjetivoUseCase: conHistorialDeSesion(
    new SugerirVariableObjetivo(sesionAnalisisStore, datasetGenericoRepository),
    historialDeAnalisis,
    'VariableObjetivo'
  ),
  definirVariableObjetivoUseCase,
  corregirTipoDeVariableUseCase,
  // M-15, Ronda 2 (RF-120 a RF-123). El decorador de la limpieza audita
  // (RF-138) y emite la única notificación de resumen del proceso (RF-122).
  proponerTratamientoDeFaltantesUseCase: new ProponerTratamientoDeFaltantes(sesionAnalisisStore),
  aplicarLimpiezaDeDatasetUseCase: new AplicarLimpiezaDeDatasetConAuditoria(
    new AplicarLimpiezaDeDataset(sesionAnalisisStore, datasetGenericoRepository),
    auditoriaRepository,
    servicioDeNotificaciones,
    historialDeAnalisis
  ),
  consultarBitacoraDeDatasetUseCase: new ConsultarBitacoraDeDataset(datasetGenericoRepository),
  // RF-136 (M-12): consultar y recuperar versiones de un dataset.
  listarDatasetsGenericosUseCase: new ListarDatasetsGenericos(datasetGenericoRepository),
  listarVersionesDeDatasetUseCase: new ListarVersionesDeDataset(datasetGenericoRepository),
  abrirDatasetGenericoUseCase: new AbrirDatasetGenerico(datasetGenericoRepository, sesionAnalisisStore),
  // RF-139 (M-09, pieza habilitadora): auditado como la corrección de tipo y
  // la variable objetivo — las tres cambian cómo se interpreta el dataset, y
  // las tres puede aplicarlas una plantilla de análisis (RF-12).
  configurarCriterioDeClasificacionUseCase,
  // RF-12 (M-02): plantillas de análisis. Aplicar una pasa por los tres casos
  // de uso de arriba, ya decorados: cada cambio queda auditado y en la
  // bitácora como si el analista lo hubiera hecho a mano.
  guardarPlantillaDeAnalisisUseCase: new GuardarPlantillaDeAnalisis(sesionAnalisisStore, datasetGenericoRepository, plantillaDeAnalisisRepository),
  listarPlantillasDeAnalisisUseCase: new ListarPlantillasDeAnalisis(plantillaDeAnalisisRepository),
  eliminarPlantillaDeAnalisisUseCase: new EliminarPlantillaDeAnalisis(plantillaDeAnalisisRepository),
  aplicarPlantillaDeAnalisisUseCase: new AplicarPlantillaDeAnalisisConAuditoria(
    new AplicarPlantillaDeAnalisis(
      sesionAnalisisStore,
      datasetGenericoRepository,
      plantillaDeAnalisisRepository,
      corregirTipoDeVariableUseCase,
      definirVariableObjetivoUseCase,
      configurarCriterioDeClasificacionUseCase
    ),
    auditoriaRepository
  ),
  // RF-135 (M-12): sin decorador de auditoría — es una consulta de
  // verificación, no una escritura ni una de las operaciones de RF-138.
  verificarIntegridadDatasetUseCase: new VerificarIntegridadDataset(datasetGenericoRepository),
  // Fase 3: reciben sesionId en vez de un archivo — leen del mismo
  // sesionAnalisisStore que acaba de poblar analizarDatasetGenericoUseCase.
  // RF-11: cada uno queda en el historial la primera vez que se pide en una
  // sesión de análisis.
  calcularEstadisticasDescriptivasGenericoUseCase: conHistorialDeSesion(
    new CalcularEstadisticasDescriptivasGenerico(sesionAnalisisStore),
    historialDeAnalisis,
    'EstadisticasDescriptivas'
  ),
  analizarColumnaUnivariadoGenericoUseCase: conHistorialDeSesion(
    new AnalizarColumnaUnivariadoGenerico(sesionAnalisisStore),
    historialDeAnalisis,
    'AnalisisUnivariado'
  ),
  // Fase 4: bivariado/multivariado (correlación) y detección de outliers —
  // mismo sesionAnalisisStore, mismo criterio IDOR.
  calcularMatrizCorrelacionGenericoUseCase: conHistorialDeSesion(
    new CalcularMatrizCorrelacionGenerico(sesionAnalisisStore),
    historialDeAnalisis,
    'MatrizDeCorrelacion'
  ),
  detectarOutliersGenericoUseCase: conHistorialDeSesion(new DetectarOutliersGenerico(sesionAnalisisStore), historialDeAnalisis, 'ValoresAtipicos'),
  // M-15 (RF-114/RF-116/RF-117), Ronda 1: mismo sesionAnalisisStore, mismo
  // criterio IDOR que el resto de la familia de endpoints de sesión.
  analizarCalidadDatasetGenericoUseCase: conHistorialDeSesion(
    new AnalizarCalidadDatasetGenerico(sesionAnalisisStore),
    historialDeAnalisis,
    'CalidadDeDatos'
  ),
  // Fase 5: mismo geradorDeInformes (GeneradorInformePDF) ya compartido con
  // generarInformeUseCase/generarResumenEjecutivoUseCase — un "documento de
  // datos" distinto (DatosInformeDataset), mismo generador PDF/Word.
  generarInformeDatasetUseCase: new GenerarInformeDatasetConAuditoria(
    new GenerarInformeDataset(
      sesionAnalisisStore,
      geradorDeInformes,
      analistaRepository,
      // Para decir en el informe de qué versión son los datos y qué limpieza
      // la produjo (sección 8, RF-123/136).
      datasetGenericoRepository
    ),
    // RF-95/RF-101/RF-11: auditado, notificado y en el historial, igual que
    // el informe del catálogo.
    auditoriaRepository,
    servicioDeNotificaciones,
    historialDeAnalisis,
    sesionAnalisisStore,
    datasetGenericoRepository
  ),
  // "Restablecer datos": acción administrativa (requiereRol('administrador')
  // en DatasetController.ts) — auditada igual que cualquier otro cambio de
  // dataset (RF-94).
  reiniciarDatasetUseCase: new ReiniciarDatasetConAuditoria(new ReiniciarDataset(vulnerabilidadRepository), auditoriaRepository),
  // "Convertir link a Excel": reutiliza exactamente los mismos adaptadores de
  // seguridad ya conectados arriba (descargadorDeArchivos, nvdApiClient) —
  // no crea ninguna instancia nueva ni relaja ningún control de SSRF/allowlist.
  convertirUrlAExcelUseCase: new ConvertirUrlAExcel(descargadorDeArchivos, nvdApiClient),
  // RF-99 (M-13, retoma): sin decorador de auditoría — es configuración de
  // preferencias propias, mismo criterio que editarPerfilUseCase en cuanto a
  // "acción sobre uno mismo", pero no está en el alcance de RF-94 (auditoría
  // de vulnerabilidades) ni RF-16 (notificación de cambio de perfil).
  configurarUmbralCriticoUseCase: new ConfigurarUmbralCritico(analistaRepository),
  // RF-100 (M-13, retoma): expuesto en el container para que server.ts lo
  // registre en el cron al arrancar (ver más abajo) — no tiene ruta HTTP,
  // es exclusivamente disparado por ProgramadorDeTareas.
  notificarPlazosProximosAVencerUseCase: new NotificarPlazosProximosAVencer(
    analistaRepository,
    vulnerabilidadRepository,
    emisorDeAlertasDePlazo
  ),
  // RF-100 (M-13, retoma): expuesto para que server.ts registre la tarea
  // cron de plazos próximos a vencer al arrancar — antes era una variable
  // privada del módulo, solo usada acá adentro para programarInformePeriodicoUseCase
  // (que sigue siendo opt-in, registrado por el propio controller cuando el
  // analista lo pide).
  programadorDeTareas
};
