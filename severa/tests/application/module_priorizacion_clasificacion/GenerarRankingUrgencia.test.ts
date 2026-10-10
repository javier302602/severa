import { GenerarRankingUrgencia } from '../../../src/application/usecases/module_priorizacion_clasificacion/GenerarRankingUrgencia';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../../src/domain/shared/value-objects/EstadoRemediacion';
import { emisorDeAlertasDePrueba } from '../../dobles/RegistroDeAlertasEmitidasEnMemoria';
import { EscalaDeClasificacionRepositoryEnMemoria } from '../../dobles/EscalaDeClasificacionRepositoryEnMemoria';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { VariableDeConsultaInvalidaError } from '../../../src/domain/errors/VariableDeConsultaInvalidaError';

function repoFalso(vulnerabilidades: Vulnerabilidad[]): jest.Mocked<VulnerabilidadRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
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

function servicioFalsoSimple(): ServicioDeNotificaciones {
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

describe('GenerarRankingUrgencia', () => {
  // RF-73 (auditoría M-09): reverificado a mano igual que en
  // MotorDePriorizacion.test.ts — los 3 ítems de este test caen en 3 buckets
  // de nivel de riesgo distintos (Crítico/Alto/Moderado), un solo elemento
  // por bucket, así que el puntaje ponderado nunca decide acá y el orden es
  // idéntico al de antes de RF-73.
  test('genera el ranking ordenado por nivel de riesgo y CVSS con datos reales del dataset', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'), 45),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), 12)
    ];

    const repo = repoFalso(dataset);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
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
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    const ranking = await usecase.ejecutar('analista-1');

    expect(ranking.entradas.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual([
      'CVE-2021-44228',
      'CVE-2021-34527',
      'CVE-2021-20021'
    ]);
    expect(ranking.entradas.map((entrada) => entrada.nivelDeRiesgo)).toEqual(['Crítico', 'Alto', 'Moderado']);
  });

  test('dispara la alerta de plazo excedido (RF-76) solo para vulnerabilidades pendientes que superaron su plazo', async () => {
    const excedida = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, new Date('2000-01-01T00:00:00Z')
    ); // Crítico, plazo 7 días, cargada hace décadas -> excedida

    const dentroDePlazo = new Vulnerabilidad(
      '2', new IdentificadorCVE('CVE-2021-45046'), new CvssScore(9.0), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 1, undefined, undefined, undefined, new Date()
    ); // Crítico, cargada hoy -> dentro de plazo

    const remediadaAunqueVieja = new Vulnerabilidad(
      '3', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL',
      new TipoAccesoValue('No'), 3, undefined, undefined,
      new EstadoRemediacionValue('Pendiente').transicionarA('EnProceso').transicionarA('Remediada'),
      new Date('2000-01-01T00:00:00Z')
    ); // Crítico, cargada hace décadas, pero ya remediada -> no debe alertar

    const repo = repoFalso([excedida, dentroDePlazo, remediadaAunqueVieja]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
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
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-1');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledWith(
      expect.objectContaining({ cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      'analista-1'
    );
  });

  test('RF-76 (Sprint 14): cuando se pasa analistaId, la alerta de plazo excedido queda asociada a ese analista', async () => {
    const excedida = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, new Date('2000-01-01T00:00:00Z')
    );

    const repo = repoFalso([excedida]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
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
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-7');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledWith(
      expect.objectContaining({ cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      'analista-7'
    );
  });

  // Carga por etapas (2026-07-19) + RF-28/RF-69: con un nivel, filtra por el
  // rango de CVSS que le da la escala del analista (SQL), en vez de listar()
  // el catálogo completo. Ya no se lee la columna severidad.
  test('con un nivel, filtra por su rango según la escala (se aceptan los nombres viejos) en vez de listar() el catálogo', async () => {
    const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5);
    const repo = repoFalso([]);
    repo.filtrarPorNivelDeRiesgo.mockResolvedValue([critica]);
    const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioFalsoSimple()), escalas);

    const conCvss = await usecase.ejecutar('analista-1', undefined, 'Crítica');
    await escalas.guardar('analista-1', EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 }));
    const conPropia = await usecase.ejecutar('analista-1', undefined, 'Crítico');

    expect(repo.filtrarPorNivelDeRiesgo).toHaveBeenNthCalledWith(1, { nivel: 'Crítico', minimo: 9, menorQue: null }, 'analista-1');
    expect(repo.filtrarPorNivelDeRiesgo).toHaveBeenNthCalledWith(2, { nivel: 'Crítico', minimo: 8.5, menorQue: null }, 'analista-1');
    expect(repo.listar).not.toHaveBeenCalled();
    expect(conCvss.entradas).toHaveLength(1);
    expect(conCvss.escala.personalizada).toBe(false);
    expect(conPropia.escala.personalizada).toBe(true);
  });

  test('sin nivel, sigue listando el catálogo completo', async () => {
    const repo = repoFalso([]);
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioFalsoSimple()), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-1');

    expect(repo.listar).toHaveBeenCalledWith('analista-1');
    expect(repo.filtrarPorNivelDeRiesgo).not.toHaveBeenCalled();
  });

  test('un nivel que no existe se rechaza con un mensaje claro', async () => {
    const usecase = new GenerarRankingUrgencia(repoFalso([]), emisorDeAlertasDePrueba(servicioFalsoSimple()), new EscalaDeClasificacionRepositoryEnMemoria());

    await expect(usecase.ejecutar('analista-1', undefined, 'Urgente')).rejects.toThrow(VariableDeConsultaInvalidaError);
  });

  function vencida(id: string, cvss = 9.5): Vulnerabilidad {
    // Crítico (plazo de 7 días), cargada hace décadas -> vencida.
    return new Vulnerabilidad(
      id,
      new IdentificadorCVE(`CVE-2021-${20000 + Number(id)}`),
      new CvssScore(cvss),
      'Software',
      new TipoAccesoValue('Sí'),
      5,
      undefined,
      undefined,
      undefined,
      new Date('2000-01-01T00:00:00Z')
    );
  }

  function servicioFalso(): jest.Mocked<ServicioDeNotificaciones> {
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

  // Bug real: generar el ranking es una consulta que se hace en cada visita
  // a Priorización, y cada vez notificaba TODAS las vencidas otra vez. Con
  // un catálogo grande el centro de notificaciones juntaba decenas de miles
  // de avisos repetidos (y la pantalla que los mostraba se colgaba).
  test('volver a generar el ranking no repite las alertas que ya se emitieron', async () => {
    const servicioDeNotificaciones = servicioFalso();
    const usecase = new GenerarRankingUrgencia(repoFalso([vencida('1'), vencida('2')]), emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-1');
    await usecase.ejecutar('analista-1');
    await usecase.ejecutar('analista-1');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(2);
  });

  test('una vulnerabilidad que vence después sí se avisa, sin repetir las anteriores', async () => {
    const servicioDeNotificaciones = servicioFalso();
    const repo = repoFalso([vencida('1')]);
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());
    await usecase.ejecutar('analista-1');

    (repo.listar as jest.Mock).mockResolvedValue([vencida('1'), vencida('2')]);
    await usecase.ejecutar('analista-1');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(2);
    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: '2' }),
      'analista-1'
    );
  });

  test('cada analista recibe la alerta de sus propias vulnerabilidades, aunque compartan id', async () => {
    const servicioDeNotificaciones = servicioFalso();
    const usecase = new GenerarRankingUrgencia(repoFalso([vencida('1')]), emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-1');
    await usecase.ejecutar('analista-2');

    expect(servicioDeNotificaciones.notificarPlazoExcedido.mock.calls.map(([, analistaId]) => analistaId)).toEqual(['analista-1', 'analista-2']);
  });

  test('con muchas vulnerabilidades vencidas emite UN resumen, no una notificación por cada una', async () => {
    const TOTAL = 450;
    const vencidas = Array.from({ length: TOTAL }, (_, i) => vencida(String(i)));
    const servicioDeNotificaciones = servicioFalso();
    const usecase = new GenerarRankingUrgencia(repoFalso(vencidas), emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-1');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).not.toHaveBeenCalled();
    expect(servicioDeNotificaciones.notificarResumenDeAlertasDePlazo).toHaveBeenCalledTimes(1);
    const [analistaId, tipo, incluidas] = servicioDeNotificaciones.notificarResumenDeAlertasDePlazo.mock.calls[0];
    expect(analistaId).toBe('analista-1');
    expect(tipo).toBe('PlazoVencido');
    expect(incluidas).toHaveLength(TOTAL);

    // Y la segunda vez, nada.
    await usecase.ejecutar('analista-1');
    expect(servicioDeNotificaciones.notificarResumenDeAlertasDePlazo).toHaveBeenCalledTimes(1);
  });

  test('hasta 5 vencidas nuevas se avisan una por una; a partir de 6, en un resumen', async () => {
    const cinco = servicioFalso();
    await new GenerarRankingUrgencia(repoFalso(['1', '2', '3', '4', '5'].map((id) => vencida(id))), emisorDeAlertasDePrueba(cinco), new EscalaDeClasificacionRepositoryEnMemoria()).ejecutar('analista-1');
    expect(cinco.notificarPlazoExcedido).toHaveBeenCalledTimes(5);
    expect(cinco.notificarResumenDeAlertasDePlazo).not.toHaveBeenCalled();

    const seis = servicioFalso();
    await new GenerarRankingUrgencia(repoFalso(['1', '2', '3', '4', '5', '6'].map((id) => vencida(id))), emisorDeAlertasDePrueba(seis), new EscalaDeClasificacionRepositoryEnMemoria()).ejecutar('analista-1');
    expect(seis.notificarPlazoExcedido).not.toHaveBeenCalled();
    expect(seis.notificarResumenDeAlertasDePlazo).toHaveBeenCalledTimes(1);
  });

  test('si no se pudo avisar, el ranking falla y la alerta se vuelve a intentar la próxima vez (no se pierde)', async () => {
    const servicioDeNotificaciones = servicioFalso();
    servicioDeNotificaciones.notificarPlazoExcedido.mockRejectedValueOnce(new Error('base caída'));
    const usecase = new GenerarRankingUrgencia(repoFalso([vencida('1')]), emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await expect(usecase.ejecutar('analista-1')).rejects.toThrow('base caída');
    await usecase.ejecutar('analista-1');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(2);
  });

  // RF-71 (auditoría M-09, frente B): plazosPersonalizados llega hasta
  // estaPlazoExcedido, no solo hasta el display — decide si RF-76 dispara.
  test('con plazosPersonalizados más estricto, dispara la alerta de plazo excedido antes que el default', async () => {
    const fechaCarga = new Date('2026-01-01T00:00:00Z');
    // Crítico, cargada hace 2 días — dentro del plazo default (7 días), pero
    // fuera de un plazo personalizado de 1 día.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-03T00:00:00Z'));
    const vulnerabilidad = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, fechaCarga
    );

    const repo = repoFalso([vulnerabilidad]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
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
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    await usecase.ejecutar('analista-1', undefined, undefined, { plazosPersonalizados: { Crítico: 1, Alto: 30, Moderado: 90, Bajo: 180 } });

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  // RF-73: pesoCriterio/pesoUrgencia llegan hasta generarRanking — se
  // ejercita con el mismo par de vulnerabilidades (CVSS y días en
  // direcciones opuestas) que MotorDePriorizacion.test.ts para comprobar
  // que la opción realmente viaja desde el caso de uso hasta el motor.
  test('propaga pesoCriterio/pesoUrgencia a generarRanking (puede cambiar el orden dentro de un nivel de riesgo)', async () => {
    const masCvssMenosDias = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), 12);
    const menosCvssMasDias = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2014-0160'), new CvssScore(7.5), 'OpenSSL', new TipoAccesoValue('Remoto'), 20);
    const repo = repoFalso([menosCvssMasDias, masCvssMenosDias]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
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
    const usecase = new GenerarRankingUrgencia(repo, emisorDeAlertasDePrueba(servicioDeNotificaciones), new EscalaDeClasificacionRepositoryEnMemoria());

    const ranking = await usecase.ejecutar('analista-1', undefined, undefined, { pesoCriterio: 0.3, pesoUrgencia: 0.7 });

    expect(ranking.entradas.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual(['CVE-2014-0160', 'CVE-2021-34527']);
  });

  // RF-28 / RF-69 (Modo B) + RF-76: cambiar la escala cambia los plazos, pero
  // no puede inundar el centro de notificaciones ni repetir alertas.
  describe('alertas de plazo vencido al cambiar la escala', () => {
    const diezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const cienDiasAtras = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const cargadaEl = (id: string, cvss: number, fecha: Date) =>
      new Vulnerabilidad(id, new IdentificadorCVE(`CVE-2026-${10000 + Number(id)}`), new CvssScore(cvss), 'S', new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, fecha);

    test('si cientos pasan a vencidas por la escala nueva, llega UNA notificación de resumen, y evaluar de nuevo no produce ninguna', async () => {
      // 300 de CVSS 8.7 cargadas hace 10 días: Alto con CVSS (30 días, no vencidas).
      const catalogo = Array.from({ length: 300 }, (_, i) => cargadaEl(String(i), 8.7, diezDiasAtras));
      const servicio = servicioFalsoSimple() as jest.Mocked<ServicioDeNotificaciones>;
      const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
      const usecase = new GenerarRankingUrgencia(repoFalso(catalogo), emisorDeAlertasDePrueba(servicio), escalas);

      await usecase.ejecutar('analista-1');
      expect(servicio.notificarResumenDeAlertasDePlazo).not.toHaveBeenCalled();
      expect(servicio.notificarPlazoExcedido).not.toHaveBeenCalled();

      // "Crítico desde 8.5": pasan a Crítico, plazo de 7 días, y ya llevan 10.
      await escalas.guardar('analista-1', EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 }));
      await usecase.ejecutar('analista-1');
      expect(servicio.notificarResumenDeAlertasDePlazo).toHaveBeenCalledTimes(1);
      expect(servicio.notificarResumenDeAlertasDePlazo.mock.calls[0][2]).toHaveLength(300);
      expect(servicio.notificarPlazoExcedido).not.toHaveBeenCalled();

      await usecase.ejecutar('analista-1');
      expect(servicio.notificarResumenDeAlertasDePlazo).toHaveBeenCalledTimes(1);
      expect(servicio.notificarPlazoExcedido).not.toHaveBeenCalled();
    });

    test('una alerta ya emitida no se repite aunque la vulnerabilidad cambie de nivel por un cambio de escala', async () => {
      // 9.5 cargada hace 100 días: vencida con cualquier nivel.
      const servicio = servicioFalsoSimple() as jest.Mocked<ServicioDeNotificaciones>;
      const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
      const usecase = new GenerarRankingUrgencia(repoFalso([cargadaEl('1', 9.5, cienDiasAtras)]), emisorDeAlertasDePrueba(servicio), escalas);

      await usecase.ejecutar('analista-1');
      expect(servicio.notificarPlazoExcedido).toHaveBeenCalledTimes(1);

      // Con Crítico desde 10.0 pasa a Alto (plazo 30): sigue vencida, pero ya se avisó.
      await escalas.guardar('analista-1', EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 10 }));
      const alto = await usecase.ejecutar('analista-1');
      expect(alto.entradas[0].nivelDeRiesgo).toBe('Alto');
      // Y de vuelta a CVSS: vuelve a Crítico, tampoco se repite.
      await escalas.eliminar('analista-1');
      await usecase.ejecutar('analista-1');

      expect(servicio.notificarPlazoExcedido).toHaveBeenCalledTimes(1);
      expect(servicio.notificarResumenDeAlertasDePlazo).not.toHaveBeenCalled();
    });
  });
});
