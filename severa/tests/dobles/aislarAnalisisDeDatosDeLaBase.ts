// Para los tests que ejercitan las rutas de "Análisis de Datos" con el
// container REAL (sin mockearlo), porque lo que prueban es la cadena completa
// HTTP -> caso de uso -> SesionAnalisisStoreEnMemoria compartido.
//
// Esas rutas escriben además en la base (dataset guardado, auditoría,
// historial de análisis, notificación de informe listo). Nada de eso es lo
// que estos tests verifican, y la suite unitaria tiene que pasar sin una
// Postgres levantada: acá se reemplazan por dobles en memoria, en un solo
// lugar, todas las dependencias de esa cadena que tocarían la base.
//
// `as any`: son campos privados a nivel de TypeScript, no en runtime.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function aislarAnalisisDeDatosDeLaBase(container: any): void {
  const datasetGenericoRepository = {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarRegistros: jest.fn().mockResolvedValue(undefined),
    buscarPorId: jest.fn().mockResolvedValue(null),
    listarRegistros: jest.fn().mockResolvedValue([])
  };
  const auditoriaRepository = {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
  // buscarPorId resuelve null a propósito: el nombre del analista en la
  // portada del informe cae a su valor por defecto ('Analista SIADE').
  const analistaRepository = {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined)
  };

  // Carga: AnalizarDatasetGenericoConAuditoria -> AnalizarDatasetGenerico.
  container.analizarDatasetGenericoUseCase.usecase.datasetGenericoRepository = datasetGenericoRepository;
  container.analizarDatasetGenericoUseCase.auditoriaRepository = auditoriaRepository;

  // Historial (RF-11): todos los análisis decorados llaman a este mismo objeto.
  container.registrarEnHistorialDeAnalisisUseCase.deSesion = jest.fn().mockResolvedValue(undefined);
  container.registrarEnHistorialDeAnalisisUseCase.delCatalogo = jest.fn().mockResolvedValue(undefined);

  // Informe: GenerarInformeDatasetConAuditoria -> GenerarInformeDataset.
  const informe = container.generarInformeDatasetUseCase;
  informe.auditoriaRepository = auditoriaRepository;
  informe.datasetGenericoRepository = datasetGenericoRepository;
  informe.servicioDeNotificaciones = { notificarInformeListo: jest.fn().mockResolvedValue(undefined) };
  informe.usecase.analistaRepository = analistaRepository;
  informe.usecase.datasetGenericoRepository = datasetGenericoRepository;
}
