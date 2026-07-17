import { ImportarDatasetDesdeUrl } from '../../src/application/usecases/ImportarDatasetDesdeUrl';
import { ImportarDataset } from '../../src/application/usecases/ImportarDataset';
import { ImportarDatasetConAuditoria } from '../../src/application/usecases/auditoria/ImportarDatasetConAuditoria';
import type { DescargadorDeArchivos } from '../../src/application/ports/out/DescargadorDeArchivos';
import type { SincronizarConApiNvdUseCase } from '../../src/application/ports/in/SincronizarConApiNvdUseCase';
import type { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import type { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import type { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';
import { LectorExcelDataset } from '../../src/infrastructure/adapters/out/dataset/LectorExcelDataset';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { UrlNoPermitidaError } from '../../src/domain/errors/UrlNoPermitidaError';

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

function importarDatasetConAuditoriaReal(auditoriaRepository: AuditoriaRepository): ImportarDatasetConAuditoria {
  return new ImportarDatasetConAuditoria(
    new ImportarDataset(vulnerabilidadRepositoryFalso()),
    auditoriaRepository,
    servicioDeNotificacionesFalso()
  );
}

describe('ImportarDatasetDesdeUrl', () => {
  test('un link de NVD delega en SincronizarConApiNvdUseCase, sin descargar ni leer ningún archivo', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = { descargar: jest.fn() };
    const lectorExcel = { leerArchivo: jest.fn() } as unknown as LectorExcelDataset;
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = {
      ejecutar: jest.fn().mockResolvedValue({ importados: 3, rechazados: 0, errores: [] })
    };

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      importarDatasetConAuditoriaReal(auditoriaFalsa()),
      sincronizarConApiNvdUseCase
    );

    const resultado = await usecase.ejecutar('https://nvd.nist.gov/vuln/detail/CVE-2021-44228', 'analista-1');

    expect(resultado).toEqual({ importados: 3, rechazados: 0, errores: [] });
    expect(sincronizarConApiNvdUseCase.ejecutar).toHaveBeenCalledWith('analista-1');
    expect(descargadorDeArchivos.descargar).not.toHaveBeenCalled();
    expect(lectorExcel.leerArchivo).not.toHaveBeenCalled();
  });

  test('un link de Google Sheets se descarga con la URL ya transformada, se lee y se importa auditado', async () => {
    const vulnerabilidad = new Vulnerabilidad(
      '1',
      new IdentificadorCVE('CVE-2024-00001'),
      new CvssScore(5.0),
      'desc',
      new TipoAccesoValue('No')
    );
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        contenido: Buffer.from('xlsx-falso'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        urlFinal: 'https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx'
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({
        importables: [{ vulnerabilidad, fuente: 'excel' }],
        rechazadas: []
      })
    } as unknown as LectorExcelDataset;
    const auditoriaRepository = auditoriaFalsa();
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      importarDatasetConAuditoriaReal(auditoriaRepository),
      sincronizarConApiNvdUseCase
    );

    const resultado = await usecase.ejecutar('https://docs.google.com/spreadsheets/d/ID123/edit#gid=0', 'analista-1');

    expect(resultado.importados).toBe(1);
    // El link de "compartir" original NUNCA se le pasa al descargador — solo
    // la forma ya transformada por DetectorDeTipoDeLink.
    expect(descargadorDeArchivos.descargar).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/ID123/export?format=xlsx'
    );
    expect(lectorExcel.leerArchivo).toHaveBeenCalledWith(expect.stringContaining('.xlsx'));
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-1', accion: 'ImportarDataset' })
    );
    expect(sincronizarConApiNvdUseCase.ejecutar).not.toHaveBeenCalled();
  });

  test('un host no permitido se rechaza sin llamar a descargar ni a leerArchivo', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = { descargar: jest.fn() };
    const lectorExcel = { leerArchivo: jest.fn() } as unknown as LectorExcelDataset;
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      importarDatasetConAuditoriaReal(auditoriaFalsa()),
      sincronizarConApiNvdUseCase
    );

    await expect(usecase.ejecutar('https://evil.example.com/malware.xlsx', 'analista-1')).rejects.toThrow(
      UrlNoPermitidaError
    );
    expect(descargadorDeArchivos.descargar).not.toHaveBeenCalled();
    expect(lectorExcel.leerArchivo).not.toHaveBeenCalled();
  });

  test('preserva la extensión real del archivo final (.csv) al nombrar el archivo temporal', async () => {
    const descargadorDeArchivos: DescargadorDeArchivos = {
      descargar: jest.fn().mockResolvedValue({
        contenido: Buffer.from('csv-falso'),
        contentType: 'text/csv',
        urlFinal: 'https://www.dropbox.com/s/abc/dataset.csv?dl=1'
      })
    };
    const lectorExcel = {
      leerArchivo: jest.fn().mockResolvedValue({ importables: [], rechazadas: [] })
    } as unknown as LectorExcelDataset;
    const sincronizarConApiNvdUseCase: SincronizarConApiNvdUseCase = { ejecutar: jest.fn() };

    const usecase = new ImportarDatasetDesdeUrl(
      descargadorDeArchivos,
      lectorExcel,
      importarDatasetConAuditoriaReal(auditoriaFalsa()),
      sincronizarConApiNvdUseCase
    );

    await usecase.ejecutar('https://www.dropbox.com/s/abc/dataset.csv?dl=0', 'analista-1');

    expect(lectorExcel.leerArchivo).toHaveBeenCalledWith(expect.stringMatching(/\.csv$/));
  });
});
