import { ConsolaServicioDeNotificaciones } from '../../../../../src/infrastructure/adapters/out/notificaciones/ConsolaServicioDeNotificaciones';
import { NotificacionRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/NotificacionRepository';
import { Notificacion } from '../../../../../src/domain/entities/Notificacion';
import { Vulnerabilidad } from '../../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../../src/domain/shared/value-objects/TipoAcceso';

function notificacionRepositoryEnMemoria(): NotificacionRepository & { registros: Notificacion[] } {
  const registros: Notificacion[] = [];
  return {
    registros,
    guardar: jest.fn(async (notificacion: Notificacion) => {
      registros.push(notificacion);
    }),
    listarPorAnalista: jest.fn(async (analistaId: string) => registros.filter((n) => n.destinatario === analistaId)),
    contarPorAnalista: jest.fn(async (analistaId: string) => {
      const propias = registros.filter((n) => n.destinatario === analistaId);
      return { total: propias.length, noLeidas: propias.filter((n) => !n.leida).length };
    }),
    marcarComoLeida: jest.fn().mockResolvedValue(true),
    marcarTodasComoLeidas: jest.fn().mockResolvedValue(0),
    eliminarVarias: jest.fn().mockResolvedValue(0),
    eliminarLeidas: jest.fn().mockResolvedValue(0)
  };
}

describe('ConsolaServicioDeNotificaciones — notificarPlazoExcedido (RF-76, Sprint 14)', () => {
  const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j', new TipoAccesoValue('Sí'));

  test('cuando se provee analistaId, la alerta queda en su centro de notificaciones', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarPlazoExcedido(vulnerabilidad, 'analista-7');

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('PlazoVencido');
    expect(propias[0].mensaje).toContain('CVE-2021-44228');

    // No debe filtrarse a un analista distinto.
    const deOtro = await notificacionRepository.listarPorAnalista('analista-8');
    expect(deOtro).toHaveLength(0);
  });

  test('sin analistaId, no persiste nada (solo consola, comportamiento previo a Sprint 14)', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarPlazoExcedido(vulnerabilidad);

    expect(notificacionRepository.guardar).not.toHaveBeenCalled();
  });
});

// Bug real corregido (2026-07-19): "1 upload dataset -> 10+ notificaciones"
// — antes se llamaba a notificarVulnerabilidadCritica una vez por fila
// crítica; ahora es UNA sola llamada a este método con el resumen completo.
describe('ConsolaServicioDeNotificaciones — notificarImportacionCompletada (RF-99, resumen único)', () => {
  test('persiste UNA sola notificación con el conteo de críticas en el mensaje', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarImportacionCompletada('analista-7', {
      importados: 150,
      rechazados: 3,
      criticas: 8,
      criterioDeCriticas: 'según el corte de Crítico de tu escala: CVSS desde 8.5'
    });

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('ImportacionCompletada');
    // RF-99 + RF-28/RF-69: dice con qué regla se contaron las críticas.
    expect(propias[0].mensaje).toBe(
      'Importación completada: 150 importados, 3 rechazados, 8 crítica(s) detectada(s) (según el corte de Crítico de tu escala: CVSS desde 8.5)'
    );
  });

  test('sin críticas, el mensaje no menciona críticas', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarImportacionCompletada('analista-7', { importados: 10, rechazados: 0, criticas: 0, criterioDeCriticas: 'según el corte de Crítico de tu escala: CVSS desde 9.0' });

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias[0].mensaje).toBe('Importación completada: 10 importados, 0 rechazados');
  });
});

// RF-100 (M-13, retoma): distinto de notificarPlazoExcedido a propósito
// (tipo/mensaje en tiempo pasado allá, "próximo a vencer" acá).
describe('ConsolaServicioDeNotificaciones — notificarPlazoProximoAVencer (RF-100)', () => {
  test('persiste una notificación de tipo PlazoProximoAVencer, distinta de PlazoVencido', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j', new TipoAccesoValue('Sí'));

    await servicio.notificarPlazoProximoAVencer(vulnerabilidad, 'analista-7');

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('PlazoProximoAVencer');
    expect(propias[0].mensaje).toContain('CVE-2021-44228');
    expect(propias[0].mensaje).toContain('próximo a vencer');
  });
});

describe('ConsolaServicioDeNotificaciones — notificarVulnerabilidadCritica (RF-99)', () => {
  test('persiste una notificación de tipo VulnerabilidadCritica con CVE y CVSS en el mensaje', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.8), 'Apache Log4j', new TipoAccesoValue('Sí'));

    await servicio.notificarVulnerabilidadCritica(vulnerabilidad, 'analista-7');

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('VulnerabilidadCritica');
    expect(propias[0].mensaje).toBe('Vulnerabilidad crítica detectada: CVE-2021-44228 (CVSS 9.8)');
    expect(propias[0].leida).toBe(false);
  });
});

describe('ConsolaServicioDeNotificaciones — notificarInformeListo (RF-101)', () => {
  test('persiste una notificación de tipo InformeListo con el formato en el mensaje', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarInformeListo('analista-7', 'pdf');

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('InformeListo');
    expect(propias[0].mensaje).toBe('Informe generado (pdf)');
  });

  test('el formato docx también queda reflejado en el mensaje', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarInformeListo('analista-7', 'docx');

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias[0].mensaje).toBe('Informe generado (docx)');
  });
});

describe('ConsolaServicioDeNotificaciones — notificarActualizacionDisponible (RF-102)', () => {
  test('persiste una notificación de tipo ActualizacionNVD con el resumen de la sincronización', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarActualizacionDisponible('analista-7', { importados: 25, rechazados: 2 });

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('ActualizacionNVD');
    expect(propias[0].mensaje).toBe('Sincronización con NVD completada: 25 importados, 2 rechazados');
  });
});

describe('ConsolaServicioDeNotificaciones — notificarPerfilActualizado (RF-16)', () => {
  test('persiste una notificación que solo menciona los campos modificados, sin valores', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarPerfilActualizado('analista-7', ['correo']);

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('PerfilActualizado');
    expect(propias[0].mensaje).toBe('Tu perfil fue actualizado: se modificó correo.');
  });

  test('con varios campos, los une en el mensaje', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarPerfilActualizado('analista-7', ['nombre', 'correo']);

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias[0].mensaje).toBe('Tu perfil fue actualizado: se modificó nombre y correo.');
  });
});

// RF-122: "una única notificación de resumen: registros afectados, columnas
// afectadas y método usado por variable. El detalle queda en la bitácora."
describe('ConsolaServicioDeNotificaciones — notificarLimpiezaCompletada (RF-122)', () => {
  const resumen = {
    nombreArchivo: 'encuesta.csv',
    version: 2,
    filasAntes: 120,
    filasEliminadas: 7,
    columnasEliminadas: ['notas', 'observaciones'],
    celdasImputadas: 15,
    metodosPorVariable: [
      { variable: 'notas', metodo: 'eliminación de la columna' },
      { variable: 'edad', metodo: 'mediana' }
    ]
  };

  test('guarda UNA notificación del analista con registros, columnas y método por variable', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarLimpiezaCompletada('analista-7', resumen);

    expect(notificacionRepository.registros).toHaveLength(1);
    const [notificacion] = notificacionRepository.registros;
    expect(notificacion).toMatchObject({ tipo: 'LimpiezaCompletada', destinatario: 'analista-7', leida: false });
    expect(notificacion.mensaje).toBe(
      'Limpieza de "encuesta.csv" completada: se generó la versión 2. ' +
        'Registros: 7 fila(s) eliminada(s) de 120, 15 valor(es) imputado(s). ' +
        'Columnas eliminadas: 2 (notas, observaciones). ' +
        'Método por variable: notas: eliminación de la columna; edad: mediana. ' +
        'El detalle completo está en la bitácora del dataset.'
    );
  });

  test('sin columnas eliminadas lo dice, en vez de dejar la lista vacía', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarLimpiezaCompletada('analista-7', { ...resumen, columnasEliminadas: [] });

    expect(notificacionRepository.registros[0].mensaje).toContain('Columnas eliminadas: ninguna.');
  });

  test('no le llega a otro analista', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarLimpiezaCompletada('analista-7', resumen);

    expect(await notificacionRepository.listarPorAnalista('analista-8')).toHaveLength(0);
  });
});

// RF-76/RF-100: muchas vulnerabilidades que entran juntas en la misma
// situación de plazo generan UNA notificación.
describe('ConsolaServicioDeNotificaciones — notificarResumenDeAlertasDePlazo', () => {
  const vulnerabilidades = Array.from(
    { length: 300 },
    (_, i) => new Vulnerabilidad(String(i), new IdentificadorCVE(`CVE-2021-${10000 + i}`), new CvssScore(9.5), 'Software', new TipoAccesoValue('Sí'))
  );

  test('guarda una sola notificación para las 300, del tipo que corresponde', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarResumenDeAlertasDePlazo('analista-7', 'PlazoVencido', vulnerabilidades);

    expect(notificacionRepository.registros).toHaveLength(1);
    expect(notificacionRepository.registros[0]).toMatchObject({ tipo: 'PlazoVencido', destinatario: 'analista-7', leida: false });
    expect(notificacionRepository.registros[0].mensaje).toMatch(/^Plazo de remediación excedido en 300 vulnerabilidades: .* y 297 más\. El detalle está en Priorización\.$/);
  });

  test('el resumen de "próximo a vencer" queda con su propio tipo', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarResumenDeAlertasDePlazo('analista-7', 'PlazoProximoAVencer', vulnerabilidades);

    expect(notificacionRepository.registros[0].tipo).toBe('PlazoProximoAVencer');
    expect(notificacionRepository.registros[0].mensaje).toMatch(/próximo a vencer/);
  });

  test('sin vulnerabilidades no guarda nada', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarResumenDeAlertasDePlazo('analista-7', 'PlazoVencido', []);

    expect(notificacionRepository.guardar).not.toHaveBeenCalled();
  });
});
