import { ImportarDatasetConAuditoria } from '../../../src/application/usecases/auditoria/ImportarDatasetConAuditoria';
import { ImportarDatasetUseCase, ResumenImportacion } from '../../../src/application/ports/in/ImportarDatasetUseCase';
import { AuditoriaRepository } from '../../../src/application/ports/out/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../src/application/ports/out/ServicioDeNotificaciones';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/value-objects/TipoAcceso';

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

function usecaseFalso(resumen: ResumenImportacion): ImportarDatasetUseCase {
  return { ejecutar: jest.fn().mockResolvedValue(resumen) };
}

describe('ImportarDatasetConAuditoria', () => {
  test('RF-99: notifica vulnerabilidad crítica cuando el CVSS importado es >= 9.0', async () => {
    const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
    const resultado = {
      importables: [{ vulnerabilidad: critica, fuente: 'excel' }],
      rechazadas: []
    };
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new ImportarDatasetConAuditoria(
      usecaseFalso({ importados: 1, rechazados: 0, errores: [], excelDescartadosBase64: null }),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    await decorator.ejecutar(resultado, 'analista-7');

    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledWith('analista-7', {
      importados: 1,
      rechazados: 0,
      criticas: 1
    });
  });

  test('CVSS menor a 9.0: la notificación de resumen queda con criticas=0', async () => {
    const noCritica = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-99999'), new CvssScore(8.9), 'Nginx', new TipoAccesoValue('No'));
    const resultado = {
      importables: [{ vulnerabilidad: noCritica, fuente: 'excel' }],
      rechazadas: []
    };
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new ImportarDatasetConAuditoria(
      usecaseFalso({ importados: 1, rechazados: 0, errores: [], excelDescartadosBase64: null }),
      auditoriaFalsa(),
      servicioDeNotificaciones
    );

    await decorator.ejecutar(resultado, 'analista-7');

    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledWith('analista-7', {
      importados: 1,
      rechazados: 0,
      criticas: 0
    });
  });

  // Bug real corregido (2026-07-19): antes esto disparaba una
  // notificarVulnerabilidadCritica POR CADA fila crítica (2 llamadas acá) —
  // ahora es UNA sola notificarImportacionCompletada con el conteo incluido,
  // sin importar cuántas críticas haya en la importación.
  test('varias críticas en la misma importación: UNA sola notificación con el conteo, no una por fila', async () => {
    const critica1 = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
    const critica2 = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'));
    const noCritica = new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(5.0), 'Nginx', new TipoAccesoValue('No'));
    const resultado = {
      importables: [
        { vulnerabilidad: critica1, fuente: 'excel' },
        { vulnerabilidad: critica2, fuente: 'excel' },
        { vulnerabilidad: noCritica, fuente: 'excel' }
      ],
      rechazadas: []
    };
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new ImportarDatasetConAuditoria(
      usecaseFalso({ importados: 3, rechazados: 0, errores: [], excelDescartadosBase64: null }),
      auditoriaFalsa(),
      servicioDeNotificaciones
    );

    await decorator.ejecutar(resultado, 'analista-7');

    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledWith('analista-7', {
      importados: 3,
      rechazados: 0,
      criticas: 2
    });
  });

  test('sigue registrando auditoría aunque no haya ninguna vulnerabilidad crítica', async () => {
    const auditoriaRepository = auditoriaFalsa();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const decorator = new ImportarDatasetConAuditoria(
      usecaseFalso({ importados: 0, rechazados: 0, errores: [], excelDescartadosBase64: null }),
      auditoriaRepository,
      servicioDeNotificaciones
    );

    await decorator.ejecutar({ importables: [], rechazadas: [] }, 'analista-7');

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'analista-7', accion: 'ImportarDataset' })
    );
    expect(servicioDeNotificaciones.notificarImportacionCompletada).toHaveBeenCalledWith('analista-7', {
      importados: 0,
      rechazados: 0,
      criticas: 0
    });
  });

  // Fase 1 (informe): único lugar donde sobrevive el nombre real del
  // archivo subido — se embebe en `detalle` cuando se lo pasan explícito.
  test('embebe el nombre de archivo en el detalle de auditoría cuando se lo pasan', async () => {
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new ImportarDatasetConAuditoria(
      usecaseFalso({ importados: 2, rechazados: 1, errores: [], excelDescartadosBase64: null }),
      auditoriaRepository,
      servicioDeNotificacionesFalso()
    );

    await decorator.ejecutar({ importables: [], rechazadas: [] }, 'analista-7', 'dataset-julio.xlsx');

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: '2 importados, 1 rechazados (archivo: dataset-julio.xlsx)' })
    );
  });

  test('sin nombre de archivo (sync NVD / importar por link), el detalle queda igual que antes', async () => {
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new ImportarDatasetConAuditoria(
      usecaseFalso({ importados: 2, rechazados: 1, errores: [], excelDescartadosBase64: null }),
      auditoriaRepository,
      servicioDeNotificacionesFalso()
    );

    await decorator.ejecutar({ importables: [], rechazadas: [] }, 'analista-7');

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: '2 importados, 1 rechazados' })
    );
  });
});
