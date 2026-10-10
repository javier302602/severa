import { NotificarPlazosProximosAVencer } from '../../../src/application/usecases/module_notificaciones_alertas/NotificarPlazosProximosAVencer';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { EmisorDeAlertasDePlazo } from '../../../src/application/usecases/module_notificaciones_alertas/EmisorDeAlertasDePlazo';
import { RegistroDeAlertasEmitidasEnMemoria, emisorDeAlertasDePrueba } from '../../dobles/RegistroDeAlertasEmitidasEnMemoria';

function analistaRepositoryFalso(analistas: Analista[]): AnalistaRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(null),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue(analistas)
  };
}

function vulnerabilidadRepositoryFalso(porAnalista: Record<string, Vulnerabilidad[]>): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn(async (analistaId: string) => porAnalista[analistaId] ?? []),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    filtrarPorNivelDeRiesgo: jest.fn().mockResolvedValue([]),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

function servicioDeNotificacionesFalso(): ServicioDeNotificaciones {
  return {
    notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
    notificarPlazoProximoAVencer: jest.fn().mockResolvedValue(undefined),
    notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
    notificarInformeListo: jest.fn().mockResolvedValue(undefined),
    notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarPerfilActualizado: jest.fn().mockResolvedValue(undefined),
    notificarLimpiezaCompletada: jest.fn().mockResolvedValue(undefined),
    notificarResumenDeAlertasDePlazo: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
  };
}

// Crítico: plazo recomendado 7 días. fechaCarga fija a "ahora - 6 días" deja
// el vencimiento a 1 día de distancia — dentro de la ventana de 48hs.
function vulnerabilidadProximaAVencer(id: string): Vulnerabilidad {
  const seisDiasAtras = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  return new Vulnerabilidad(id, new IdentificadorCVE(`CVE-2024-${id.padStart(4, '0')}`), new CvssScore(10.0), 'desc', new TipoAccesoValue('Sí'), 1, undefined, undefined, undefined, seisDiasAtras);
}

function vulnerabilidadLejosDeVencer(id: string): Vulnerabilidad {
  const hoy = new Date();
  return new Vulnerabilidad(id, new IdentificadorCVE(`CVE-2024-${id.padStart(4, '0')}`), new CvssScore(10.0), 'desc', new TipoAccesoValue('Sí'), 1, undefined, undefined, undefined, hoy);
}

describe('NotificarPlazosProximosAVencer', () => {
  test('recorre TODOS los analistas devueltos por listarTodos, no solo uno', async () => {
    const analistaA = new Analista('analista-A', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaB = new Analista('analista-B', 'Beto', new Correo('beto@example.com'), 'hash', 'analista');
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso({
      'analista-A': [vulnerabilidadProximaAVencer('1')],
      'analista-B': [vulnerabilidadProximaAVencer('2')]
    });
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const usecase = new NotificarPlazosProximosAVencer(
      analistaRepositoryFalso([analistaA, analistaB]),
      vulnerabilidadRepository,
      emisorDeAlertasDePrueba(servicioDeNotificaciones)
    );

    await usecase.ejecutar();

    expect(vulnerabilidadRepository.listar).toHaveBeenCalledWith('analista-A');
    expect(vulnerabilidadRepository.listar).toHaveBeenCalledWith('analista-B');
    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenCalledTimes(2);
  });

  test('solo notifica las vulnerabilidades próximas a vencer, no todo el catálogo del analista', async () => {
    const analista = new Analista('analista-A', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const proxima = vulnerabilidadProximaAVencer('1');
    const lejos = vulnerabilidadLejosDeVencer('2');
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso({ 'analista-A': [proxima, lejos] });
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const usecase = new NotificarPlazosProximosAVencer(
      analistaRepositoryFalso([analista]),
      vulnerabilidadRepository,
      emisorDeAlertasDePrueba(servicioDeNotificaciones)
    );

    await usecase.ejecutar();

    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenCalledWith(proxima, 'analista-A');
  });

  test('sin analistas, no consulta ninguna vulnerabilidad ni notifica nada', async () => {
    const vulnerabilidadRepository = vulnerabilidadRepositoryFalso({});
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const usecase = new NotificarPlazosProximosAVencer(
      analistaRepositoryFalso([]),
      vulnerabilidadRepository,
      emisorDeAlertasDePrueba(servicioDeNotificaciones)
    );

    await usecase.ejecutar();

    expect(vulnerabilidadRepository.listar).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).not.toHaveBeenCalled();
  });

  // RF-100: "la notificación se envía 48 horas antes del vencimiento". La
  // tarea corre todos los días y una vulnerabilidad pasa dos días dentro de
  // esa ventana: antes se avisaba las dos veces.
  test('la corrida del día siguiente no repite el aviso de una vulnerabilidad que sigue en la ventana de 48 horas', async () => {
    const analista = new Analista('analista-A', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const usecase = new NotificarPlazosProximosAVencer(
      analistaRepositoryFalso([analista]),
      vulnerabilidadRepositoryFalso({ 'analista-A': [vulnerabilidadProximaAVencer('1')] }),
      emisorDeAlertasDePrueba(servicioDeNotificaciones)
    );

    await usecase.ejecutar();
    await usecase.ejecutar();

    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenCalledTimes(1);
  });

  test('muchas por vencer a la vez: un resumen por analista, no una notificación por vulnerabilidad', async () => {
    const analista = new Analista('analista-A', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const muchas = Array.from({ length: 40 }, (_, i) => vulnerabilidadProximaAVencer(String(i + 1)));
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const usecase = new NotificarPlazosProximosAVencer(
      analistaRepositoryFalso([analista]),
      vulnerabilidadRepositoryFalso({ 'analista-A': muchas }),
      emisorDeAlertasDePrueba(servicioDeNotificaciones)
    );

    await usecase.ejecutar();

    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarResumenDeAlertasDePlazo).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarResumenDeAlertasDePlazo).toHaveBeenCalledWith('analista-A', 'PlazoProximoAVencer', muchas);
  });

  test('la alerta de "por vencer" y la de "vencido" de una misma vulnerabilidad son independientes', async () => {
    const registro = new RegistroDeAlertasEmitidasEnMemoria();
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    const emisor = new EmisorDeAlertasDePlazo(registro, servicioDeNotificaciones);
    const vulnerabilidad = vulnerabilidadProximaAVencer('1');

    expect(await emisor.emitir('analista-A', 'PlazoProximoAVencer', [vulnerabilidad])).toBe(1);
    expect(await emisor.emitir('analista-A', 'PlazoVencido', [vulnerabilidad])).toBe(1);
    expect(await emisor.emitir('analista-A', 'PlazoVencido', [vulnerabilidad])).toBe(0);

    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(1);
  });

  test('si falla con un analista, sigue con los demás y al final informa el fallo', async () => {
    const analistaA = new Analista('analista-A', 'Ana', new Correo('ana@example.com'), 'hash', 'analista');
    const analistaB = new Analista('analista-B', 'Beto', new Correo('beto@example.com'), 'hash', 'analista');
    const servicioDeNotificaciones = servicioDeNotificacionesFalso();
    (servicioDeNotificaciones.notificarPlazoProximoAVencer as jest.Mock).mockRejectedValueOnce(new Error('base caída'));
    const usecase = new NotificarPlazosProximosAVencer(
      analistaRepositoryFalso([analistaA, analistaB]),
      vulnerabilidadRepositoryFalso({ 'analista-A': [vulnerabilidadProximaAVencer('1')], 'analista-B': [vulnerabilidadProximaAVencer('2')] }),
      emisorDeAlertasDePrueba(servicioDeNotificaciones)
    );

    await expect(usecase.ejecutar()).rejects.toThrow('No se pudieron emitir las alertas de plazo de 1 analista(s): analista-A: base caída');

    // Al analista B sí le llegó la suya.
    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenLastCalledWith(expect.objectContaining({ id: '2' }), 'analista-B');

    // Y la del analista A quedó pendiente: la próxima corrida la emite.
    await usecase.ejecutar();
    expect(servicioDeNotificaciones.notificarPlazoProximoAVencer).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1' }), 'analista-A');
  });
});
