import fs from 'fs';
import { SincronizarConApiNvd } from '../../src/application/usecases/SincronizarConApiNvd';
import { ImportarDataset } from '../../src/application/usecases/ImportarDataset';
import { ImportarDatasetConAuditoria } from '../../src/application/usecases/auditoria/ImportarDatasetConAuditoria';
import { NvdApiClient } from '../../src/application/ports/out/NvdApiClient';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';
import { LectorExcelDataset } from '../../src/infrastructure/adapters/out/dataset/LectorExcelDataset';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function vulnerabilidadRepositoryFalso(): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([])
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
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined)
  };
}

describe('SincronizarConApiNvd', () => {
  // El caso de uso escribe el dataset descargado a un archivo temporal antes de
  // leerlo con LectorExcelDataset, y lo borra en `finally`; se evita tocar
  // disco real en el test.
  beforeEach(() => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    jest.spyOn(fs, 'unlink').mockImplementation(((_path: unknown, callback: (error: NodeJS.ErrnoException | null) => void) => {
      callback(null);
    }) as typeof fs.unlink);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('importa el dataset descargado de NVD y registra la sincronización en auditoría con el analista que la disparó', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue(Buffer.from('contenido-fingido'))
    };

    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({
        importables: [
          {
            vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(7.8), 'desc', new TipoAccesoValue('Sí')),
            fuente: 'excel'
          }
        ],
        rechazadas: []
      })
    } as unknown as LectorExcelDataset;

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

    const usecase = new SincronizarConApiNvd(nvdApiClient, lectorExcel, importarDatasetUseCase, servicioDeNotificaciones);

    const resultado = await usecase.ejecutar('analista-9');

    expect(resultado.importados).toBe(1);
    expect(vulnerabilidadRepository.guardar).toHaveBeenCalledTimes(1);
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

    const lectorExcel = { leerArchivo: jest.fn() } as unknown as LectorExcelDataset;

    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    const usecase = new SincronizarConApiNvd(nvdApiClient, lectorExcel, importarDatasetUseCase, servicioDeNotificaciones);

    await expect(usecase.ejecutar('analista-9')).rejects.toThrow('NVD no responde');

    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarActualizacionDisponible).not.toHaveBeenCalled();
  });

  test('una vulnerabilidad crítica traída por la sincronización dispara la alerta RF-99, no solo la RF-102', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue(Buffer.from('contenido-fingido'))
    };

    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({
        importables: [
          {
            vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
            fuente: 'excel'
          }
        ],
        rechazadas: []
      })
    } as unknown as LectorExcelDataset;

    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    const usecase = new SincronizarConApiNvd(nvdApiClient, lectorExcel, importarDatasetUseCase, servicioDeNotificaciones);

    await usecase.ejecutar('analista-9');

    expect(servicioDeNotificaciones.notificarVulnerabilidadCritica).toHaveBeenCalledWith(
      expect.objectContaining({ cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      'analista-9'
    );
    expect(servicioDeNotificaciones.notificarActualizacionDisponible).toHaveBeenCalledWith(
      'analista-9',
      expect.objectContaining({ importados: 1 })
    );
  });

  test('usa un nombre de archivo temporal único (no el nombre fijo tmp_dataset.xlsx) y lo borra al terminar', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue(Buffer.from('contenido-fingido'))
    };
    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({ importables: [], rechazadas: [] })
    } as unknown as LectorExcelDataset;
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );
    const usecase = new SincronizarConApiNvd(nvdApiClient, lectorExcel, importarDatasetUseCase, servicioDeNotificaciones);

    await usecase.ejecutar('analista-9');

    const rutaEscrita = (fs.writeFileSync as jest.Mock).mock.calls[0][0] as string;
    const rutaLeida = (lectorExcel.leerArchivo as jest.Mock).mock.calls[0][0] as string;
    const rutaBorrada = (fs.unlink as unknown as jest.Mock).mock.calls[0][0] as string;

    expect(rutaEscrita).not.toBe('tmp_dataset.xlsx');
    expect(rutaEscrita).toMatch(/severa-nvd-sync-.+\.xlsx$/);
    expect(rutaLeida).toBe(rutaEscrita);
    expect(rutaBorrada).toBe(rutaEscrita);
  });

  test('borra el archivo temporal incluso si la importación falla', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso();
    const auditoriaRepository = auditoriaFalsa();

    const nvdApiClient: NvdApiClient = {
      descargarDataset: jest.fn().mockResolvedValue(Buffer.from('contenido-fingido'))
    };
    const lectorExcel = {
      leerArchivo: jest.fn().mockRejectedValue(new Error('archivo corrupto'))
    } as unknown as LectorExcelDataset;
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const importarDatasetUseCase = new ImportarDatasetConAuditoria(
      new ImportarDataset(vulnerabilidadRepository),
      auditoriaRepository,
      servicioDeNotificaciones
    );
    const usecase = new SincronizarConApiNvd(nvdApiClient, lectorExcel, importarDatasetUseCase, servicioDeNotificaciones);

    await expect(usecase.ejecutar('analista-9')).rejects.toThrow('archivo corrupto');

    expect(fs.unlink).toHaveBeenCalledTimes(1);
  });
});
