import { ConsolaServicioDeNotificaciones } from '../../src/infrastructure/adapters/out/notificaciones/ConsolaServicioDeNotificaciones';
import { NotificacionRepository } from '../../src/application/ports/out/NotificacionRepository';
import { Notificacion } from '../../src/domain/entities/Notificacion';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function notificacionRepositoryEnMemoria(): NotificacionRepository & { registros: Notificacion[] } {
  const registros: Notificacion[] = [];
  return {
    registros,
    guardar: jest.fn(async (notificacion: Notificacion) => {
      registros.push(notificacion);
    }),
    listarPorAnalista: jest.fn(async (analistaId: string) => registros.filter((n) => n.destinatario === analistaId)),
    marcarComoLeida: jest.fn().mockResolvedValue(true),
  marcarTodasComoLeidas: jest.fn().mockResolvedValue(0),
  eliminarVarias: jest.fn().mockResolvedValue(0)
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

    await servicio.notificarImportacionCompletada('analista-7', { importados: 150, rechazados: 3, criticas: 8 });

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias).toHaveLength(1);
    expect(propias[0].tipo).toBe('ImportacionCompletada');
    expect(propias[0].mensaje).toBe('Importación completada: 150 importados, 3 rechazados, 8 crítica(s) detectada(s)');
  });

  test('sin críticas, el mensaje no menciona críticas', async () => {
    const notificacionRepository = notificacionRepositoryEnMemoria();
    const servicio = new ConsolaServicioDeNotificaciones(notificacionRepository);

    await servicio.notificarImportacionCompletada('analista-7', { importados: 10, rechazados: 0, criticas: 0 });

    const propias = await notificacionRepository.listarPorAnalista('analista-7');
    expect(propias[0].mensaje).toBe('Importación completada: 10 importados, 0 rechazados');
  });
});
