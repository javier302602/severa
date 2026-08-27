import { SincronizarConApiNvd } from '../../src/application/usecases/SincronizarConApiNvd';
import { ImportarDataset } from '../../src/application/usecases/ImportarDataset';
import { ImportarDatasetConAuditoria } from '../../src/application/usecases/auditoria/ImportarDatasetConAuditoria';
import { NvdApiClient } from '../../src/application/ports/out/NvdApiClient';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

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

describe('SincronizarConApiNvd', () => {
  // NvdApiClient ya devuelve {importables, rechazadas} parseado (ver
  // ParseadorRespuestaNvd.ts) — el caso de uso ya no toca disco ni pasa por
  // LectorExcelDataset, así que los tests de archivo temporal (nombre único,
  // borrado en finally) quedaron obsoletos junto con ese código.
  test('importa el dataset descargado de NVD y registra la sincronización en auditoría con el analista que la disparó', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue({
        importables: [
          {
            vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(7.8), 'desc', new TipoAccesoValue('Sí')),
            fuente: 'nvd-api'
          }
        ],
        rechazadas: []
      })
    };

    // Se usa el decorador REAL (no un mock) para probar que SincronizarConApiNvd
    // efectivamente pasa por el registro de auditoría, y no solo que llama a
    // "algo" — mismo hueco reportado en M-12 (bypaseaba ImportarDatasetConAuditoria
    // instanciando su propio ImportarDataset sin envolver).
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    const usecase = new SincronizarConApiNvd(nvdApiClient, importarDatasetUseCase, servicioDeNotificaciones);

    const urlPegadaPorElUsuario = 'https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=2024-01-01T00:00:00.000&pubEndDate=2024-04-30T00:00:00.000';
    const resultado = await usecase.ejecutar('analista-9', urlPegadaPorElUsuario);

    // Bug real (2026-07-17): antes se ignoraba la URL pegada y se llamaba
    // siempre contra un host fijo reconstruido internamente.
    expect(nvdApiClient.descargarDataset).toHaveBeenCalledWith(urlPegadaPorElUsuario);
    expect(resultado.importados).toBe(1);
    expect(vulnerabilidadRepository.guardarLote).toHaveBeenCalledTimes(1);
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-9', accion: 'ImportarDataset' })
    );
    // RF-102: la sincronización en sí se notifica, además de cualquier
    // alerta RF-99 de vulnerabilidad crítica que dispare la importación.
    expect(servicioDeNotificaciones.notificarActualizacionDisponible).toHaveBeenCalledWith(
      'analista-9',
      expect.objectContaining({ importados: 1, rechazados: 0 })
    );
  });

  test('NO registra auditoría si la descarga del dataset falla', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockRejectedValue(new Error('NVD no responde'))
    };

    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    const usecase = new SincronizarConApiNvd(nvdApiClient, importarDatasetUseCase, servicioDeNotificaciones);

    await expect(usecase.ejecutar('analista-9', 'https://services.nvd.nist.gov/rest/json/cves/2.0')).rejects.toThrow('NVD no responde');

    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarActualizacionDisponible).not.toHaveBeenCalled();
  });

  test('una vulnerabilidad crítica traída por la sincronización dispara la alerta RF-99, no solo la RF-102', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue({
        importables: [
          {
            vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
            fuente: 'nvd-api'
          }
        ],
        rechazadas: []
      })
    };

    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    const usecase = new SincronizarConApiNvd(nvdApiClient, importarDatasetUseCase, servicioDeNotificaciones);

    await usecase.ejecutar('analista-9', 'https://services.nvd.nist.gov/rest/json/cves/2.0');

    // Bug real corregido (2026-07-19): ya no es una alerta por fila crítica
    // (notificarVulnerabilidadCritica) — la sincronización con NVD reusa
    // ImportarDatasetConAuditoria.ejecutar(), que ahora resume las críticas
    // en UNA sola notificarImportacionCompletada, además de la propia
    // notificarActualizacionDisponible (RF-102) de esta clase.
    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledWith('analista-9', {
      importados: 1,
      rechazados: 0,
      criticas: 1
    });
    expect(servicioDeNotificaciones.notificarActualizacionDisponible).toHaveBeenCalledWith(
      'analista-9',
      expect.objectContaining({ importados: 1 })
    );
  });
});
