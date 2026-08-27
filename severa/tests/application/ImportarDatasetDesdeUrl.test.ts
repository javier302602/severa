import { ImportarDatasetDesdeUrl } from '../../src/application/usecases/ImportarDatasetDesdeUrl';
import { ImportarDataset } from '../../src/application/usecases/ImportarDataset';
import { ImportarDatasetConAuditoria } from '../../src/application/usecases/auditoria/ImportarDatasetConAuditoria';
import type { DescargadorDeArchivos } from '../../src/application/ports/out/DescargadorDeArchivos';
import type { SincronizarConApiNvdUseCase } from '../../src/application/ports/in/SincronizarConApiNvdUseCase';
import type { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import type { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import type { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';
import { LectorExcelDataset, FilaProcesada } from '../../src/infrastructure/adapters/out/dataset/LectorExcelDataset';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { UrlNoPermitidaError } from '../../src/domain/errors/UrlNoPermitidaError';

function vulnerabilidadRepositoryFalso(): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

function servicioDeNotificacionesFalso(): ServicioDeNotificaciones {
  return {
    notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
    notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
    notificarInformeListo: jest.fn().mockResolvedValue(undefined),
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
  notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
  };
}

function vulnerabilidad(cve: string, cvssScore = 5.0): Vulnerabilidad {
  return new Vulnerabilidad(cve, new IdentificadorCVE(cve), new CvssScore(cvssScore), 'desc', new TipoAccesoValue('No'));
}

// Simula LectorExcelDataset.leerArchivoCsvEnStreaming: en vez de leer un CSV
// real de disco, entrega directamente las filas ya clasificadas que reciba
// por parámetro, llamando a onFila() como lo haría el streaming real — el
// parseo de CSV en sí ya tiene su propio test (LectorExcelDataset.test.ts).
function mockLeerCsvEnStreaming(filas: FilaProcesada[]): jest.Mock {
  return jest.fn().mockImplementation(async (_ruta: string, _mapeo: unknown, onFila: (fila: FilaProcesada) => Promise<void>) => {
    for (const fila of filas) {
      await onFila(fila);
    }
  });
}

describe('ImportarDatasetDesdeUrl', () => {
  test('una URL malformada o con esquema no-https se sigue rechazando (esto NO cambió con la eliminación de la allowlist)', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = { descargar: jest.fn() };
    const lectorExcel = { leerArchivo: jest.fn(), leerArchivoCsvEnStreaming: jest.fn() } as unknown as LectorExcelDataset;
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaFalsa(), servicioDeNotificacionesFalso()),
      sincronizarConApiNvdUseCase,
      vulnerabilidadRepository
    );

    await expect(usecase.ejecutar('http://storage.googleapis.com/bucket/dataset.csv', 'analista-1')).rejects.toThrow(
      UrlNoPermitidaError
    );
    expect(descargadorDeArchivos.descargar).not.toHaveBeenCalled();
  });

  test('un link de NVD delega en SincronizarConApiNvdUseCase con la URL EXACTA pegada (no una reconstruida), sin descargar ni leer ningún archivo', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = { descargar: jest.fn() };
    const lectorExcel = { leerArchivo: jest.fn(), leerArchivoCsvEnStreaming: jest.fn() } as unknown as LectorExcelDataset;
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ importados: 3, rechazados: 0, errores: [] })
    };
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaFalsa(), servicioDeNotificacionesFalso()),
      sincronizarConApiNvdUseCase,
      vulnerabilidadRepository
    );

    const urlPegada = 'https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=2024-01-01T00:00:00.000&pubEndDate=2024-04-30T00:00:00.000';
    const resultado = await usecase.ejecutar(urlPegada, 'analista-1');

    expect(resultado).toEqual({ importados: 3, rechazados: 0, errores: [] });
    expect(sincronizarConApiNvdUseCase.ejecutar).toHaveBeenCalledWith('analista-1', urlPegada);
    expect(descargadorDeArchivos.descargar).not.toHaveBeenCalled();
  });

  test('un link de Google Sheets (.xlsx) usa leerArchivo (en memoria) y se importa auditado', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo: '/tmp/no-se-toca.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        urlFinal: 'https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx'
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({
        importables: [{ vulnerabilidad: vulnerabilidad('CVE-2024-00001'), fuente: 'excel' }],
        rechazadas: []
      }),
      leerArchivoCsvEnStreaming: jest.fn()
    } as unknown as LectorExcelDataset;
    const auditoriaRepository = auditoriaFalsa();
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaRepository, servicioDeNotificacionesFalso()),
      sincronizarConApiNvdUseCase,
      vulnerabilidadRepository
    );

    const resultado = await usecase.ejecutar('https://docs.google.com/spreadsheets/d/ID123/edit#gid=0', 'analista-1');

    expect(resultado.importados).toBe(1);
    expect(descargadorDeArchivos.descargar).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx'
    );
    expect(lectorExcel.leerArchivo).toHaveBeenCalledWith('/tmp/no-se-toca.xlsx', undefined);
    expect(lectorExcel.leerArchivoCsvEnStreaming).not.toHaveBeenCalled();
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-1', accion: 'ImportarDataset' })
    );
    expect(sincronizarConApiNvdUseCase.ejecutar).not.toHaveBeenCalled();
  });

  // Cambio de diseño (2026-07-17): la allowlist de hosts específicos se
  // eliminó como filtro de entrada — CUALQUIER host https ahora llega hasta
  // el descargador (que es quien de verdad protege contra SSRF: DNS + IP
  // pública, ver DescargadorDeArchivosHttp.test.ts).
  test('un host que antes NO estaba en ninguna allowlist ahora SÍ se pasa al descargador, con la query string (firma) intacta', async () => {
    const urlFirmada = 'https://storage.googleapis.com/bucket/dataset.csv?X-Goog-Signature=abc123';
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo: '/tmp/no-se-toca.csv',
        contentType: 'text/csv',
        urlFinal: urlFirmada
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn(),
      leerArchivoCsvEnStreaming: mockLeerCsvEnStreaming([])
    } as unknown as LectorExcelDataset;
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaFalsa(), servicioDeNotificacionesFalso()),
      sincronizarConApiNvdUseCase,
      vulnerabilidadRepository
    );

    await usecase.ejecutar(urlFirmada, 'analista-1');

    expect(descargadorDeArchivos.descargar).toHaveBeenCalledWith(urlFirmada);
    // .csv real (no .xlsx): despacha al camino de streaming, no a leerArchivo.
    expect(lectorExcel.leerArchivoCsvEnStreaming).toHaveBeenCalledWith('/tmp/no-se-toca.csv', undefined, expect.any(Function));
    expect(lectorExcel.leerArchivo).not.toHaveBeenCalled();
  });

  // mapeoColumnas (2026-07-17): ningún dataset público real trae las
  // columnas con los nombres exactos que espera SEVERA — el mapeo flexible
  // que ya existía para "subir archivo" ahora también viaja en "importar
  // desde link", tanto para el camino .csv en streaming como para .xlsx.
  test('mapeoColumnas se propaga a leerArchivoCsvEnStreaming para un .csv', async () => {
    const mapeo = { cve: 'cve_id', cvssScore: 'base_score', accesoRemoto: 'attack_vector' };
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo: '/tmp/dataset.csv',
        contentType: 'text/csv',
        urlFinal: 'https://ejemplo.example.com/dataset.csv'
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn(),
      leerArchivoCsvEnStreaming: mockLeerCsvEnStreaming([])
    } as unknown as LectorExcelDataset;
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaFalsa(), servicioDeNotificacionesFalso()),
      { ejecutar: jest.fn() },
      vulnerabilidadRepository
    );

    await usecase.ejecutar('https://ejemplo.example.com/dataset.csv', 'analista-1', mapeo);

    expect(lectorExcel.leerArchivoCsvEnStreaming).toHaveBeenCalledWith('/tmp/dataset.csv', mapeo, expect.any(Function));
  });

  test('mapeoColumnas se propaga a leerArchivo para un .xlsx', async () => {
    const mapeo = { cve: 'Identificador' };
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo: '/tmp/dataset.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        urlFinal: 'https://ejemplo.example.com/dataset.xlsx'
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({ importables: [], rechazadas: [] }),
      leerArchivoCsvEnStreaming: jest.fn()
    } as unknown as LectorExcelDataset;
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaFalsa(), servicioDeNotificacionesFalso()),
      { ejecutar: jest.fn() },
      vulnerabilidadRepository
    );

    await usecase.ejecutar('https://ejemplo.example.com/dataset.xlsx', 'analista-1', mapeo);

    expect(lectorExcel.leerArchivo).toHaveBeenCalledWith('/tmp/dataset.xlsx', mapeo);
  });

  test('un .csv se importa en streaming: inserta en lotes, notifica críticas por fila y audita host+path (nunca la query string firmada)', async () => {
    const urlFirmada = 'https://storage.googleapis.com/bucket/dataset.csv?X-Goog-Signature=SECRETO-NO-DEBE-QUEDAR-GUARDADO';
    const critica = vulnerabilidad('CVE-2021-44228', 10.0);
    const normal = vulnerabilidad('CVE-2024-00002', 3.0);

    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo: '/tmp/dataset.csv',
        contentType: 'text/csv',
        urlFinal: urlFirmada
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn(),
      leerArchivoCsvEnStreaming: mockLeerCsvEnStreaming([
        { tipo: 'importable', dato: { vulnerabilidad: critica, fuente: 'excel' } },
        { tipo: 'importable', dato: { vulnerabilidad: normal, fuente: 'excel' } },
        { tipo: 'rechazada', dato: { fila: 4, error: 'CVSS fuera de rango', datos: { CVE: 'CVE-2024-00003', 'CVSS Score': '99' } } }
      ])
    } as unknown as LectorExcelDataset;
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaRepository, servicioDeNotificaciones),
      sincronizarConApiNvdUseCase,
      vulnerabilidadRepository
    );

    const resultado = await usecase.ejecutar(urlFirmada, 'analista-1');

    expect(resultado.importados).toBe(2);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.errores).toEqual(['CVSS fuera de rango']);

    // Inserción por lotes: las 2 filas importables en UN solo guardarLote(),
    // cada una ya con analistaId asignado.
    expect(vulnerabilidadRepository.guardarLote).toHaveBeenCalledTimes(1);
    expect(vulnerabilidadRepository.guardarLote).toHaveBeenCalledWith([
      expect.objectContaining({ analistaId: 'analista-1', cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      expect.objectContaining({ analistaId: 'analista-1', cve: expect.objectContaining({ valor: 'CVE-2024-00002' }) })
    ]);

    // RF-99 (bug real corregido 2026-07-19): ya no es una alerta por fila
    // crítica durante el streaming — se cuenta sobre la marcha y se resume
    // en UNA sola notificarImportacionCompletada al terminar (1 crítica de
    // las 2 filas importadas: CVE-2021-44228 con CVSS 10.0).
    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledWith('analista-1', {
      importados: 2,
      rechazados: 1,
      criticas: 1
    });

    // Auditoría: host+path sí, query string (firma) nunca.
    const [detalleRegistrado] = (auditoriaRepository.registrar as jest.Mock).mock.calls[0];
    expect(detalleRegistrado.detalle).toContain('storage.googleapis.com/bucket/dataset.csv');
    expect(detalleRegistrado.detalle).not.toContain('X-Goog-Signature');
    expect(detalleRegistrado.detalle).not.toContain('SECRETO-NO-DEBE-QUEDAR-GUARDADO');
  });

  test('un .csv con más de 1000 filas inserta en varios lotes (streaming real, no un array completo en memoria)', async () => {
    const TOTAL_FILAS = 2500;
    const filas: FilaProcesada[] = Array.from({ length: TOTAL_FILAS }, (_, i) => ({
      tipo: 'importable' as const,
      dato: { vulnerabilidad: vulnerabilidad(`CVE-2024-${10000 + i}`), fuente: 'excel' }
    }));

    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        rutaArchivo: '/tmp/dataset-grande.csv',
        contentType: 'text/csv',
        urlFinal: 'https://ejemplo.example.com/dataset-grande.csv'
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn(),
      leerArchivoCsvEnStreaming: mockLeerCsvEnStreaming(filas)
    } as unknown as LectorExcelDataset;
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      new ImportarDatasetConAuditoria(new ImportarDataset(vulnerabilidadRepository), auditoriaFalsa(), servicioDeNotificacionesFalso()),
      { ejecutar: jest.fn() },
      vulnerabilidadRepository
    );

    const resultado = await usecase.ejecutar('https://ejemplo.example.com/dataset-grande.csv', 'analista-1');

    expect(resultado.importados).toBe(TOTAL_FILAS);
    expect(vulnerabilidadRepository.guardar).not.toHaveBeenCalled();
    expect(vulnerabilidadRepository.guardarLote).toHaveBeenCalledTimes(3);
    expect((vulnerabilidadRepository.guardarLote as jest.Mock).mock.calls[0][0]).toHaveLength(1000);
    expect((vulnerabilidadRepository.guardarLote as jest.Mock).mock.calls[1][0]).toHaveLength(1000);
    expect((vulnerabilidadRepository.guardarLote as jest.Mock).mock.calls[2][0]).toHaveLength(500);
  });
});
