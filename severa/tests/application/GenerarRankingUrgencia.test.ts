import { GenerarRankingUrgencia } from '../../src/application/usecases/GenerarRankingUrgencia';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../src/domain/value-objects/EstadoRemediacion';

function repoFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
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

describe('GenerarRankingUrgencia', () => {
  test('genera el ranking ordenado por nivel de riesgo y CVSS con datos reales del dataset', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'), 45),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), 12)
    ];

    const repo = repoFalso(dataset);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    const ranking = await usecase.ejecutar('analista-1');

    expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual([
      'CVE-2021-44228',
      'CVE-2021-34527',
      'CVE-2021-20021'
    ]);
    expect(ranking.map((entrada) => entrada.nivelDeRiesgo)).toEqual(['Crítico', 'Alto', 'Moderado']);
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
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

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
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    await usecase.ejecutar('analista-7');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledWith(
      expect.objectContaining({ cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      'analista-7'
    );
  });

  // Carga por etapas (2026-07-19): con severidad, usa filtrarPorSeveridad
  // (ya existente, reutilizado — no un método nuevo) en vez de listar() el
  // catálogo completo.
  test('con severidad, usa filtrarPorSeveridad en vez de listar() el catálogo completo', async () => {
    const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.8), 'Apache Log4j', new TipoAccesoValue('Sí'));
    const repo = repoFalso([]);
    (repo.filtrarPorSeveridad as jest.Mock).mockResolvedValue([critica]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    const ranking = await usecase.ejecutar('analista-1', undefined, 'Crítica');

    expect(repo.filtrarPorSeveridad).toHaveBeenCalledWith('Crítica', 'analista-1');
    expect(repo.listar).not.toHaveBeenCalled();
    expect(ranking).toHaveLength(1);
  });

  test('sin severidad, sigue usando listar() (comportamiento sin cambios)', async () => {
    const dataset = [new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.8), 'Apache Log4j', new TipoAccesoValue('Sí'))];
    const repo = repoFalso(dataset);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    await usecase.ejecutar('analista-1');

    expect(repo.listar).toHaveBeenCalledWith('analista-1');
    expect(repo.filtrarPorSeveridad).not.toHaveBeenCalled();
  });

  // Bug real (2026-07-19): con miles de vulnerabilidades vencidas, un solo
  // Promise.all sin límite dispara todas las notificaciones (cada una un
  // INSERT real) en paralelo — satura el pool de conexiones de Postgres.
  // Se procesan en lotes chicos y secuenciales entre sí, sin cambiar CUÁLES
  // vulnerabilidades se notifican.
  test('con muchas vulnerabilidades vencidas, notifica en lotes (no todas en un solo Promise.all sin límite)', async () => {
    const TOTAL = 450; // > 2 lotes de 200
    const vencidas = Array.from(
      { length: TOTAL },
      (_, i) =>
        new Vulnerabilidad(
          String(i),
          new IdentificadorCVE(`CVE-2021-${20000 + i}`),
          new CvssScore(9.5),
          'Software',
          new TipoAccesoValue('Sí'),
          5,
          undefined,
          undefined,
          undefined,
          new Date('2000-01-01T00:00:00Z') // Crítico, cargada hace décadas -> vencida
        )
    );
    const repo = repoFalso(vencidas);
    let maximoEnParalelo = 0;
    let enCurso = 0;
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockImplementation(async () => {
        enCurso++;
        maximoEnParalelo = Math.max(maximoEnParalelo, enCurso);
        await Promise.resolve();
        enCurso--;
      }),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined),
    notificarImportacionCompletada: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    await usecase.ejecutar('analista-1');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(TOTAL);
    expect(maximoEnParalelo).toBeLessThanOrEqual(200);
  });
});
